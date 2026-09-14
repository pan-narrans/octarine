use crate::config::UpdateChannel;
use serde::Serialize;
use tauri::{AppHandle, Runtime, Url};
use tauri_plugin_updater::{Update, UpdaterExt};

const UPDATER_PUBLIC_KEY: &str = "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEYzMzcyNUVCQ0Y2REE0NApSV1JFMnZhOFhuSXpEejIwUTJOWGNiNklXVm5xMU5XU2xkM3Q2Z0VOTlBvMGRSakM1L0wxYkdwVAo=";
const UPDATE_ENDPOINT_STABLE: &str = "https://pan-narrans.github.io/octarine/updates/stable.json";
const UPDATE_ENDPOINT_BETA: &str = "https://pan-narrans.github.io/octarine/updates/beta.json";
const RELEASE_PAGE_PREFIX: &str = "https://github.com/pan-narrans/octarine/releases/tag/v";
const MAX_RELEASE_NOTES_CHARS: usize = 500;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, ts_rs::TS)]
#[serde(rename_all = "snake_case")]
pub enum DistributionMethod {
    Direct,
    AppImage,
    Unknown,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, ts_rs::TS)]
#[serde(rename_all = "snake_case")]
pub enum UpdateInstallStrategy {
    SelfUpdate,
    Unsupported,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct UpdateRuntimeInfo {
    pub current_version: String,
    pub channel: UpdateChannel,
    pub channel_mutable: bool,
    pub distribution: DistributionMethod,
    pub install_strategy: UpdateInstallStrategy,
    pub check_configured: bool,
    pub installation_supported: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, ts_rs::TS)]
#[serde(rename_all = "camelCase")]
pub struct AvailableUpdate {
    pub current_version: String,
    pub version: String,
    pub notes: Option<String>,
    pub published_at: Option<String>,
    pub channel: UpdateChannel,
    pub download_page_url: String,
}

pub fn distribution_method() -> DistributionMethod {
    option_env!("OCTARINE_DISTRIBUTION")
        .and_then(parse_distribution_method)
        .unwrap_or_else(platform_default_distribution)
}

pub fn effective_channel(configured: UpdateChannel) -> UpdateChannel {
    configured
}

pub fn runtime_info(current_version: &str, configured_channel: UpdateChannel) -> UpdateRuntimeInfo {
    let distribution = distribution_method();
    let channel = effective_channel(configured_channel);
    UpdateRuntimeInfo {
        current_version: current_version.to_string(),
        channel,
        channel_mutable: true,
        distribution,
        install_strategy: install_strategy(distribution),
        check_configured: distribution != DistributionMethod::Unknown
            && update_endpoint(channel).is_ok(),
        installation_supported: installation_is_supported(distribution, channel),
    }
}

pub async fn check_remote_update<R: Runtime>(
    app: &AppHandle<R>,
    channel: UpdateChannel,
) -> Result<Option<AvailableUpdate>, String> {
    let distribution = distribution_method();
    if distribution == DistributionMethod::Unknown {
        return Err("Self-update is unavailable for this build.".to_string());
    }
    update_endpoint(channel)?;
    let update = build_updater(app, channel)?
        .check()
        .await
        .map_err(redact_error)?;
    Ok(update.map(|update| available_update(update, channel)))
}

pub async fn install_self_update<R: Runtime>(
    app: &AppHandle<R>,
    channel: UpdateChannel,
    expected_version: &str,
) -> Result<(), String> {
    let distribution = distribution_method();
    ensure_self_update_configured(distribution, channel)?;
    let update = build_updater(app, channel)?
        .check()
        .await
        .map_err(redact_error)?
        .ok_or_else(|| "Selected update is no longer available.".to_string())?;
    if update.version != expected_version {
        return Err("Available update changed; check again before installing.".to_string());
    }
    update
        .download_and_install(|_, _| {}, || {})
        .await
        .map_err(redact_error)?;
    app.restart();
}

fn build_updater<R: Runtime>(
    app: &AppHandle<R>,
    channel: UpdateChannel,
) -> Result<tauri_plugin_updater::Updater, String> {
    let endpoint = update_endpoint(channel)?;
    app.updater_builder()
        .pubkey(UPDATER_PUBLIC_KEY)
        .version_comparator(|current, remote| current != remote.version)
        .endpoints(vec![endpoint])
        .map_err(redact_error)?
        .build()
        .map_err(redact_error)
}

fn available_update(update: Update, channel: UpdateChannel) -> AvailableUpdate {
    let download_page_url = release_page_url(&update.version);
    AvailableUpdate {
        current_version: update.current_version,
        version: update.version,
        notes: truncate_release_notes(update.body),
        published_at: update.date.map(|date| date.to_string()),
        channel,
        download_page_url,
    }
}

fn truncate_release_notes(notes: Option<String>) -> Option<String> {
    notes.map(|notes| {
        let mut characters = notes.chars();
        let truncated: String = characters.by_ref().take(MAX_RELEASE_NOTES_CHARS).collect();
        if characters.next().is_some() {
            format!("{truncated}…")
        } else {
            truncated
        }
    })
}

fn release_page_url(version: &str) -> String {
    let version = version.strip_prefix('v').unwrap_or(version);
    format!("{RELEASE_PAGE_PREFIX}{version}")
}

fn update_endpoint(channel: UpdateChannel) -> Result<Url, String> {
    let raw = match channel {
        UpdateChannel::Stable => UPDATE_ENDPOINT_STABLE,
        UpdateChannel::Beta => UPDATE_ENDPOINT_BETA,
    };
    Url::parse(raw).map_err(|_| "Updater endpoint is invalid for this build.".to_string())
}

fn ensure_self_update_configured(
    distribution: DistributionMethod,
    channel: UpdateChannel,
) -> Result<(), String> {
    if !matches!(
        distribution,
        DistributionMethod::Direct | DistributionMethod::AppImage
    ) {
        return Err("Self-update is unavailable for this build.".to_string());
    }
    if UPDATER_PUBLIC_KEY.trim().is_empty() {
        return Err("Updater signing key is not configured for this build.".to_string());
    }
    ensure_install_location_writable(distribution)?;
    update_endpoint(channel).map(|_| ())
}

fn ensure_install_location_writable(distribution: DistributionMethod) -> Result<(), String> {
    if distribution != DistributionMethod::AppImage {
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    {
        let app_image = std::env::var_os("APPIMAGE")
            .map(std::path::PathBuf::from)
            .ok_or_else(|| "AppImage location could not be determined.".to_string())?;
        let parent = app_image
            .parent()
            .ok_or_else(|| "AppImage location could not be determined.".to_string())?;
        tempfile::Builder::new()
            .prefix(".octarine-update-check-")
            .tempfile_in(parent)
            .map_err(|_| {
                "AppImage location is not writable. Move Octarine to a user-writable folder or download update manually."
                    .to_string()
            })?;
    }

    Ok(())
}

fn installation_is_supported(distribution: DistributionMethod, channel: UpdateChannel) -> bool {
    match distribution {
        DistributionMethod::Direct | DistributionMethod::AppImage => {
            !UPDATER_PUBLIC_KEY.trim().is_empty() && update_endpoint(channel).is_ok()
        }
        DistributionMethod::Unknown => false,
    }
}

fn install_strategy(distribution: DistributionMethod) -> UpdateInstallStrategy {
    match distribution {
        DistributionMethod::Direct | DistributionMethod::AppImage => {
            UpdateInstallStrategy::SelfUpdate
        }
        DistributionMethod::Unknown => UpdateInstallStrategy::Unsupported,
    }
}

fn platform_default_distribution() -> DistributionMethod {
    #[cfg(target_os = "macos")]
    {
        return DistributionMethod::Direct;
    }
    #[cfg(target_os = "linux")]
    {
        return if std::env::var_os("APPIMAGE").is_some() {
            DistributionMethod::AppImage
        } else {
            DistributionMethod::Unknown
        };
    }
    #[allow(unreachable_code)]
    DistributionMethod::Unknown
}

fn parse_distribution_method(value: &str) -> Option<DistributionMethod> {
    match value.trim().to_ascii_lowercase().as_str() {
        "direct" => Some(DistributionMethod::Direct),
        "appimage" => Some(DistributionMethod::AppImage),
        _ => None,
    }
}

fn redact_error(error: impl std::fmt::Display) -> String {
    format!("Update operation failed: {error}")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_supported_distribution_methods() {
        assert_eq!(
            parse_distribution_method(" direct "),
            Some(DistributionMethod::Direct)
        );
        assert_eq!(
            parse_distribution_method("appimage"),
            Some(DistributionMethod::AppImage)
        );
        assert_eq!(parse_distribution_method("snap"), None);
    }

    #[test]
    fn maps_installation_owner_to_strategy() {
        assert_eq!(
            install_strategy(DistributionMethod::Direct),
            UpdateInstallStrategy::SelfUpdate
        );
        assert_eq!(
            install_strategy(DistributionMethod::Unknown),
            UpdateInstallStrategy::Unsupported
        );
    }

    #[test]
    fn uses_published_channel_manifests() {
        assert_eq!(
            update_endpoint(UpdateChannel::Stable).unwrap().as_str(),
            "https://pan-narrans.github.io/octarine/updates/stable.json"
        );
        assert_eq!(
            update_endpoint(UpdateChannel::Beta).unwrap().as_str(),
            "https://pan-narrans.github.io/octarine/updates/beta.json"
        );
    }

    #[test]
    fn builds_immutable_release_fallback_url() {
        assert_eq!(
            release_page_url("v1.2.0-beta.3"),
            "https://github.com/pan-narrans/octarine/releases/tag/v1.2.0-beta.3"
        );
    }

    #[test]
    fn bounds_untrusted_release_notes() {
        let notes = "a".repeat(MAX_RELEASE_NOTES_CHARS + 1);
        let truncated = truncate_release_notes(Some(notes)).unwrap();
        assert_eq!(truncated.chars().count(), MAX_RELEASE_NOTES_CHARS + 1);
        assert!(truncated.ends_with('…'));
    }
}
