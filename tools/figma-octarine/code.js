figma.showUI(__html__, { width: 400, height: 360, themeColors: true });

const GENERATED_COMPONENTS = "Octarine / Generated Components";
const GENERATED_VIEWS = "Octarine / Generated Views";
const FONT = {
  regular: { family: "SF Pro", style: "Regular" },
  medium: { family: "SF Pro", style: "Medium" },
  semibold: { family: "SF Pro", style: "Semibold" },
};

let tokens;

function fixtureDate(offsetDays = 0) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return date;
}

function isoDate(date = fixtureDate()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shortDate(date = fixtureDate()) {
  return `${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function displayDate(date = fixtureDate()) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function monthLabel(date = fixtureDate()) {
  return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

async function loadDocument() {
  await Promise.all(figma.root.children.map((page) => page.loadAsync()));
  await Promise.all(Object.values(FONT).map((font) => figma.loadFontAsync(font)));
  const variables = await figma.variables.getLocalVariablesAsync();
  const byName = new Map(variables.map((variable) => [variable.name, variable]));
  const required = [
    "color/bg/canvas",
    "color/bg/sidebar",
    "color/bg/card",
    "color/bg/overlay",
    "color/text/primary",
    "color/text/secondary",
    "color/text/muted",
    "color/border/card",
    "color/border/glow",
    "color/accent/violet",
    "color/accent/indigo",
    "color/accent/emerald",
    "color/accent/amber",
    "color/accent/rose",
    "spacing/1",
    "spacing/2",
    "spacing/3",
    "spacing/4",
    "spacing/5",
    "spacing/6",
    "spacing/8",
    "spacing/12",
    "radius/sm",
    "radius/control",
    "radius/md",
    "radius/card",
    "radius/modal",
    "radius/full",
  ];
  const missing = required.filter((name) => !byName.has(name));
  if (missing.length) throw new Error(`Missing Octarine variables: ${missing.join(", ")}`);
  tokens = Object.fromEntries(required.map((name) => [name, byName.get(name)]));
}

function token(name) {
  const value = tokens[name];
  if (!value) throw new Error(`Unknown token: ${name}`);
  return value;
}

function boundPaint(variableName, opacity = 1) {
  return figma.variables.setBoundVariableForPaint(
    { type: "SOLID", color: { r: 0, g: 0, b: 0 }, opacity },
    "color",
    token(variableName),
  );
}

function fill(node, variableName, opacity = 1) {
  node.fills = [boundPaint(variableName, opacity)];
}

function stroke(node, variableName, opacity = 1) {
  node.strokes = [boundPaint(variableName, opacity)];
  node.strokeWeight = 1;
}

function bindCorners(node, variableName) {
  const variable = token(variableName);
  node.setBoundVariable("topLeftRadius", variable);
  node.setBoundVariable("topRightRadius", variable);
  node.setBoundVariable("bottomLeftRadius", variable);
  node.setBoundVariable("bottomRightRadius", variable);
}

function bindPadding(node, verticalName, horizontalName = verticalName) {
  const vertical = token(verticalName);
  const horizontal = token(horizontalName);
  node.setBoundVariable("paddingTop", vertical);
  node.setBoundVariable("paddingBottom", vertical);
  node.setBoundVariable("paddingLeft", horizontal);
  node.setBoundVariable("paddingRight", horizontal);
}

function bindGap(node, variableName) {
  node.setBoundVariable("itemSpacing", token(variableName));
}

function autoFrame(name, direction = "VERTICAL") {
  const frame = figma.createFrame();
  frame.name = name;
  frame.layoutMode = direction;
  frame.primaryAxisAlignItems = "MIN";
  frame.counterAxisAlignItems = "MIN";
  frame.primaryAxisSizingMode = "AUTO";
  frame.counterAxisSizingMode = "AUTO";
  frame.fills = [];
  frame.clipsContent = false;
  return frame;
}

function fixedAutoFrame(name, direction, width, height) {
  const frame = autoFrame(name, direction);
  frame.resize(width, height);
  frame.primaryAxisSizingMode = "FIXED";
  frame.counterAxisSizingMode = "FIXED";
  return frame;
}

function textNode(value, options = {}) {
  const node = figma.createText();
  node.name = options.name || "text";
  node.fontName = options.font || FONT.regular;
  node.fontSize = options.size || 14;
  node.lineHeight = { unit: "PIXELS", value: options.lineHeight || (options.size || 14) * 1.4 };
  node.characters = value;
  fill(node, options.color || "color/text/primary", options.opacity ?? 1);
  if (options.width) {
    node.textAutoResize = "HEIGHT";
    node.resize(options.width, node.height);
  }
  return node;
}

function sectionHeading(title, description) {
  const section = autoFrame(`Component Section / ${title}`, "VERTICAL");
  bindGap(section, "spacing/4");
  section.appendChild(textNode(title, { font: FONT.semibold, size: 24, lineHeight: 30 }));
  section.appendChild(
    textNode(description, {
      size: 13,
      lineHeight: 19,
      color: "color/text/secondary",
      width: 1100,
    }),
  );
  return section;
}

function componentFrame(name, direction = "HORIZONTAL") {
  const component = figma.createComponent();
  component.name = name;
  component.layoutMode = direction;
  component.primaryAxisAlignItems = "CENTER";
  component.counterAxisAlignItems = "CENTER";
  component.primaryAxisSizingMode = "AUTO";
  component.counterAxisSizingMode = "AUTO";
  component.fills = [];
  component.clipsContent = false;
  return component;
}

function exposeText(component, propertyName, defaultValue, nodes) {
  const key = component.addComponentProperty(propertyName, "TEXT", defaultValue);
  for (const node of nodes) node.componentPropertyReferences = { characters: key };
  return key;
}

function exposeVariantText(componentSet, propertyName, defaultValue, nodeName) {
  const key = componentSet.addComponentProperty(propertyName, "TEXT", defaultValue);
  for (const variantNode of componentSet.children) {
    const node = variantNode.findOne((child) => child.type === "TEXT" && child.name === nodeName);
    if (node) node.componentPropertyReferences = { characters: key };
  }
  return key;
}

function layoutVariants(componentSet, columns, gap = 20, padding = 24) {
  componentSet.children.forEach((child, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    child.x = padding + column * (child.width + gap);
    child.y = padding + row * (child.height + gap);
  });
  let maxX = 0;
  let maxY = 0;
  for (const child of componentSet.children) {
    maxX = Math.max(maxX, child.x + child.width);
    maxY = Math.max(maxY, child.y + child.height);
  }
  componentSet.resizeWithoutConstraints(maxX + padding, maxY + padding);
  fill(componentSet, "color/bg/card");
  bindCorners(componentSet, "radius/card");
}

function iconComponent(name, svg) {
  const svgNode = figma.createNodeFromSvg(svg);
  const component = figma.createComponent();
  component.name = `Icon / ${name}`;
  component.resize(18, 18);
  component.clipsContent = true;
  component.fills = [];
  for (const child of [...svgNode.children]) component.appendChild(child);
  svgNode.remove();
  component.resize(18, 18);
  component.description = `Reusable ${name} icon imported from an editable SVG.`;
  return component;
}

function setInstanceText(instance, prefix, value) {
  const key = Object.keys(instance.componentProperties).find((candidate) =>
    candidate.startsWith(prefix),
  );
  if (key) instance.setProperties({ [key]: value });
  const normalizedName = prefix.toLowerCase().replaceAll(" ", "");
  const text = instance.findOne(
    (node) =>
      node.type === "TEXT" && node.name.toLowerCase().replaceAll(" ", "") === normalizedName,
  );
  if (text && text.characters !== value) text.characters = value;
}

function variant(componentSet, includes) {
  return (
    componentSet.children.find(
      (child) => child.type === "COMPONENT" && includes.every((part) => child.name.includes(part)),
    ) || componentSet.defaultVariant
  );
}

async function inspectConnection() {
  await loadDocument();
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  return {
    fileName: figma.root.name,
    fileKey: figma.fileKey || "Local file",
    editorType: figma.editorType,
    pages: figma.root.children.map((page) => ({
      id: page.id,
      name: page.name,
      childCount: page.children.length,
    })),
    variableCollections: collections.map((collection) => ({
      id: collection.id,
      name: collection.name,
      variableCount: collection.variableIds.length,
    })),
  };
}

function removeExactTopLevel(page, name) {
  const existing = page.children.find((node) => node.name === name);
  if (existing) existing.remove();
}

function createCheckboxSet(parent) {
  const variants = [];
  for (const state of ["Unchecked", "Doing", "Checked"]) {
    const component = componentFrame(`State=${state}`);
    component.resize(20, 20);
    component.primaryAxisSizingMode = "FIXED";
    component.counterAxisSizingMode = "FIXED";
    bindCorners(component, "radius/full");
    if (state === "Checked") fill(component, "color/accent/emerald", 0.95);
    else {
      component.fills = [];
      stroke(component, state === "Doing" ? "color/accent/violet" : "color/text/muted");
    }
    if (state !== "Unchecked") {
      component.appendChild(
        textNode(state === "Checked" ? "✓" : "•", {
          font: FONT.semibold,
          size: state === "Checked" ? 12 : 16,
          lineHeight: 16,
          color: state === "Checked" ? "color/bg/canvas" : "color/accent/violet",
        }),
      );
    }
    variants.push(component);
  }
  const set = figma.combineAsVariants(variants, parent);
  set.name = "Checkbox";
  set.description = "Task status control with unstarted, in-progress, and completed states.";
  layoutVariants(set, 3);
  return set;
}

function createBadgeSet(parent) {
  const definitions = [
    ["Priority A", "color/accent/rose", "A"],
    ["Priority B", "color/accent/amber", "B"],
    ["Project", "color/accent/indigo", "+octarine/ui"],
    ["Context", "color/accent/emerald", "@desk"],
    ["Tag", "color/accent/amber", "#frontend"],
  ];
  const variants = [];
  for (const [kind, color, label] of definitions) {
    const component = componentFrame(`Kind=${kind}`);
    bindPadding(component, "spacing/1", "spacing/2");
    bindCorners(component, kind.startsWith("Priority") ? "radius/control" : "radius/full");
    fill(component, color, kind.startsWith("Priority") ? 0.9 : 0.13);
    stroke(component, color, 0.28);
    component.appendChild(
      textNode(label, {
        name: "label",
        font: FONT.semibold,
        size: 11,
        lineHeight: 14,
        color: kind.startsWith("Priority") ? "color/text/primary" : color,
      }),
    );
    variants.push(component);
  }
  const set = figma.combineAsVariants(variants, parent);
  set.name = "Badge";
  set.description = "Compact metadata marker for priority, project, context, and tag information.";
  layoutVariants(set, 5);
  exposeVariantText(set, "Label", "Metadata", "label");
  return set;
}

function createButtonSet(parent) {
  const variants = [];
  for (const style of ["Primary", "Secondary", "Danger"]) {
    for (const state of ["Default", "Disabled"]) {
      const component = componentFrame(`Style=${style}, State=${state}`);
      bindPadding(component, "spacing/2", "spacing/4");
      bindCorners(component, "radius/control");
      if (style === "Primary")
        fill(component, "color/accent/violet", state === "Disabled" ? 0.35 : 0.9);
      else {
        fill(component, "color/bg/card", state === "Disabled" ? 0.45 : 1);
        stroke(component, style === "Danger" ? "color/accent/rose" : "color/border/card");
      }
      component.appendChild(
        textNode(
          style === "Primary" ? "Save Changes" : style === "Danger" ? "Delete Task" : "Cancel",
          {
            name: "label",
            font: FONT.medium,
            size: 13,
            lineHeight: 18,
            color: style === "Danger" ? "color/accent/rose" : "color/text/primary",
            opacity: state === "Disabled" ? 0.55 : 1,
          },
        ),
      );
      variants.push(component);
    }
  }
  const set = figma.combineAsVariants(variants, parent);
  set.name = "Button";
  set.description = "Primary, secondary, and destructive actions with a disabled state.";
  layoutVariants(set, 2);
  exposeVariantText(set, "Label", "Button", "label");
  return set;
}

function createNavItemSet(parent, defaultIcon) {
  const variants = [];
  for (const state of ["Default", "Active"]) {
    const component = componentFrame(`State=${state}`);
    component.resize(232, 40);
    component.primaryAxisSizingMode = "FIXED";
    component.counterAxisSizingMode = "FIXED";
    component.primaryAxisAlignItems = "MIN";
    bindPadding(component, "spacing/2", "spacing/3");
    bindGap(component, "spacing/3");
    bindCorners(component, "radius/md");
    if (state === "Active") fill(component, "color/accent/violet", 0.12);
    else component.fills = [];
    const icon = defaultIcon.createInstance();
    icon.name = "icon";
    component.appendChild(icon);
    component.appendChild(
      textNode("All Tasks", {
        name: "label",
        font: state === "Active" ? FONT.medium : FONT.regular,
        size: 14,
        lineHeight: 20,
        color: state === "Active" ? "color/text/primary" : "color/text/secondary",
      }),
    );
    variants.push(component);
  }
  const set = figma.combineAsVariants(variants, parent);
  set.name = "Nav Item";
  set.description = "Sidebar navigation item with default and active states.";
  layoutVariants(set, 2);
  exposeVariantText(set, "Label", "Navigation item", "label");
  const iconKey = set.addComponentProperty("Icon", "INSTANCE_SWAP", defaultIcon.id);
  for (const child of set.children) {
    const icon = child.findOne((node) => node.type === "INSTANCE" && node.name === "icon");
    if (icon) icon.componentPropertyReferences = { mainComponent: iconKey };
  }
  return set;
}

function createSearchField(parent, searchIcon) {
  const component = componentFrame("Search Field");
  component.resize(904, 44);
  component.primaryAxisSizingMode = "FIXED";
  component.counterAxisSizingMode = "FIXED";
  component.primaryAxisAlignItems = "MIN";
  bindPadding(component, "spacing/3", "spacing/4");
  bindGap(component, "spacing/3");
  bindCorners(component, "radius/card");
  fill(component, "color/bg/card");
  stroke(component, "color/border/card");
  component.appendChild(searchIcon.createInstance());
  const placeholder = textNode("Search tasks, descriptions or projects...", {
    name: "placeholder",
    size: 14,
    lineHeight: 20,
    color: "color/text/muted",
  });
  component.appendChild(placeholder);
  exposeText(component, "Placeholder", placeholder.characters, [placeholder]);
  component.description = "Full-width search field used at the top of primary views.";
  parent.appendChild(component);
  return component;
}

function createInputField(parent) {
  const component = componentFrame("Input Field");
  component.resize(360, 36);
  component.primaryAxisSizingMode = "FIXED";
  component.counterAxisSizingMode = "FIXED";
  component.primaryAxisAlignItems = "MIN";
  bindPadding(component, "spacing/2", "spacing/3");
  bindCorners(component, "radius/control");
  fill(component, "color/bg/card");
  stroke(component, "color/border/card");
  const value = textNode("Field value", {
    name: "value",
    size: 13,
    lineHeight: 18,
    color: "color/text/primary",
  });
  component.appendChild(value);
  exposeText(component, "Value", value.characters, [value]);
  component.description = "Compact form field used by the task editor.";
  parent.appendChild(component);
  return component;
}

function createEventCard(parent) {
  const component = componentFrame("Event Card");
  component.resize(420, 42);
  component.primaryAxisSizingMode = "FIXED";
  component.counterAxisSizingMode = "FIXED";
  component.primaryAxisAlignItems = "MIN";
  bindPadding(component, "spacing/2", "spacing/4");
  bindGap(component, "spacing/4");
  bindCorners(component, "radius/md");
  fill(component, "color/bg/card");
  stroke(component, "color/border/card");
  const time = textNode("09:30", {
    name: "time",
    font: FONT.semibold,
    size: 12,
    lineHeight: 18,
    color: "color/accent/violet",
  });
  const title = textNode("Design systems stand-up", {
    name: "title",
    size: 13,
    lineHeight: 18,
  });
  component.appendChild(time);
  component.appendChild(title);
  exposeText(component, "Time", time.characters, [time]);
  exposeText(component, "Title", title.characters, [title]);
  component.description = "Timeline event row with a prominent start time and title.";
  parent.appendChild(component);
  return component;
}

function createTaskCard(parent, checkboxSet, badgeSet, editIcon) {
  const component = componentFrame("Task Card / Complex", "VERTICAL");
  component.resize(420, 210);
  component.primaryAxisSizingMode = "AUTO";
  component.counterAxisSizingMode = "FIXED";
  component.counterAxisAlignItems = "MIN";
  bindPadding(component, "spacing/4");
  bindGap(component, "spacing/2");
  bindCorners(component, "radius/card");
  fill(component, "color/bg/card");
  stroke(component, "color/border/card");
  const header = fixedAutoFrame("header", "HORIZONTAL", 388, 20);
  header.primaryAxisAlignItems = "SPACE_BETWEEN";
  header.counterAxisAlignItems = "CENTER";
  const titleGroup = autoFrame("title group", "HORIZONTAL");
  titleGroup.counterAxisAlignItems = "CENTER";
  bindGap(titleGroup, "spacing/3");
  titleGroup.appendChild(variant(checkboxSet, ["State=Unchecked"]).createInstance());
  const title = textNode("Task 1", {
    name: "title",
    font: FONT.medium,
    size: 14,
    lineHeight: 20,
  });
  titleGroup.appendChild(title);
  header.appendChild(titleGroup);
  const edit = editIcon.createInstance();
  edit.name = "Edit Details";
  header.appendChild(edit);
  component.appendChild(header);
  component.appendChild(
    textNode("Task 1 description", {
      name: "description",
      size: 12,
      lineHeight: 18,
      color: "color/text/secondary",
      width: 350,
    }),
  );
  component.appendChild(
    textNode(
      "    □  (B) Sub-task 1\n    □  (A) Sub-task 2\nSub-task 2 description\n        □  Sub-task 2-1\nSub-task 2-1 description\nTask 1 description bis",
      { name: "hierarchy", size: 12, lineHeight: 20, color: "color/text/secondary", width: 360 },
    ),
  );
  const metadata = fixedAutoFrame("metadata", "HORIZONTAL", 388, 24);
  metadata.primaryAxisAlignItems = "SPACE_BETWEEN";
  const badges = autoFrame("badges", "HORIZONTAL");
  bindGap(badges, "spacing/2");
  for (const [kind, label] of [
    ["Kind=Priority A", "A"],
    ["Kind=Project", "+octarine/launch"],
    ["Kind=Context", "@desk"],
    ["Kind=Tag", "#frontend"],
  ]) {
    const instance = variant(badgeSet, [kind]).createInstance();
    setInstanceText(instance, "Label", label);
    badges.appendChild(instance);
  }
  metadata.appendChild(badges);
  metadata.appendChild(
    textNode("0 subtasks", { size: 11, lineHeight: 16, color: "color/text/muted" }),
  );
  component.appendChild(metadata);
  exposeText(component, "Title", title.characters, [title]);
  component.description =
    "Complex task card preserving nested hierarchy and metadata relationships.";
  parent.appendChild(component);
  return component;
}

function createCompactTaskCard(parent, checkboxSet, badgeSet, editIcon) {
  const component = componentFrame("Task Card / Compact", "VERTICAL");
  component.resize(420, 126);
  component.primaryAxisSizingMode = "AUTO";
  component.counterAxisSizingMode = "FIXED";
  component.counterAxisAlignItems = "MIN";
  bindPadding(component, "spacing/4");
  bindGap(component, "spacing/2");
  bindCorners(component, "radius/card");
  fill(component, "color/bg/card");
  stroke(component, "color/border/card");
  const header = fixedAutoFrame("header", "HORIZONTAL", 388, 20);
  header.primaryAxisAlignItems = "SPACE_BETWEEN";
  header.counterAxisAlignItems = "CENTER";
  const titleGroup = autoFrame("title group", "HORIZONTAL");
  titleGroup.counterAxisAlignItems = "CENTER";
  bindGap(titleGroup, "spacing/3");
  titleGroup.appendChild(variant(checkboxSet, ["State=Doing"]).createInstance());
  titleGroup.appendChild(
    textNode("Audit the calendar at compact widths", {
      font: FONT.medium,
      size: 14,
      lineHeight: 20,
      width: 250,
    }),
  );
  header.appendChild(titleGroup);
  const headerActions = autoFrame("header actions", "HORIZONTAL");
  headerActions.counterAxisAlignItems = "CENTER";
  bindGap(headerActions, "spacing/2");
  headerActions.appendChild(
    textNode(displayDate(fixtureDate(6)), {
      font: FONT.semibold,
      size: 11,
      lineHeight: 16,
      color: "color/accent/indigo",
    }),
  );
  const edit = editIcon.createInstance();
  edit.name = "Edit Details";
  headerActions.appendChild(edit);
  header.appendChild(headerActions);
  component.appendChild(header);
  component.appendChild(
    textNode("Preserve the month hierarchy while reducing crowding.", {
      size: 12,
      lineHeight: 18,
      color: "color/text/secondary",
      width: 382,
    }),
  );
  const metadata = fixedAutoFrame("metadata", "HORIZONTAL", 388, 24);
  metadata.primaryAxisAlignItems = "SPACE_BETWEEN";
  const badges = autoFrame("badges", "HORIZONTAL");
  bindGap(badges, "spacing/2");
  for (const [kind, label] of [
    ["Kind=Priority B", "B"],
    ["Kind=Project", "+octarine/ui"],
    ["Kind=Context", "@laptop"],
    ["Kind=Tag", "#responsive"],
  ]) {
    const instance = variant(badgeSet, [kind]).createInstance();
    setInstanceText(instance, "Label", label);
    badges.appendChild(instance);
  }
  metadata.appendChild(badges);
  metadata.appendChild(
    textNode("0 subtasks", { size: 11, lineHeight: 16, color: "color/text/muted" }),
  );
  component.appendChild(metadata);
  component.description = "Compact task card for secondary active work with due date and metadata.";
  parent.appendChild(component);
  return component;
}

function createCalendarCellSet(parent) {
  const variants = [];
  for (const state of ["Default", "Today", "Other Month"]) {
    const component = componentFrame(`State=${state}`, "VERTICAL");
    component.resize(116, 98);
    component.primaryAxisSizingMode = "FIXED";
    component.counterAxisSizingMode = "FIXED";
    component.counterAxisAlignItems = "MIN";
    bindPadding(component, "spacing/2");
    bindGap(component, "spacing/1");
    bindCorners(component, "radius/md");
    fill(component, "color/bg/card", state === "Other Month" ? 0.35 : 1);
    stroke(component, state === "Today" ? "color/accent/violet" : "color/border/card");
    component.appendChild(
      textNode("18", {
        name: "date",
        font: FONT.semibold,
        size: 12,
        lineHeight: 16,
        color:
          state === "Today"
            ? "color/accent/violet"
            : state === "Other Month"
              ? "color/text/muted"
              : "color/text/primary",
      }),
    );
    component.appendChild(
      textNode("", {
        name: "event1",
        size: 10,
        lineHeight: 14,
        color: "color/text/secondary",
        width: 98,
      }),
    );
    component.appendChild(
      textNode("", {
        name: "event2",
        size: 10,
        lineHeight: 14,
        color: "color/text/secondary",
        width: 98,
      }),
    );
    variants.push(component);
  }
  const set = figma.combineAsVariants(variants, parent);
  set.name = "Calendar Cell";
  set.description =
    "Month-grid day cell with current-day and out-of-month states and event summaries.";
  layoutVariants(set, 3);
  exposeVariantText(set, "Date", "18", "date");
  exposeVariantText(set, "Event 1", "", "event1");
  exposeVariantText(set, "Event 2", "", "event2");
  return set;
}

function createTaskEditorRowSet(parent, trashIcon) {
  const variants = [];
  for (const { kind, depth, width, titleValue, descriptionValue } of [
    {
      kind: "Main",
      depth: "Root",
      width: 796,
      titleValue: "Task 1",
      descriptionValue: "Task 1 description",
    },
    {
      kind: "Subtask",
      depth: "Root",
      width: 796,
      titleValue: "(A) Sub-task 2",
      descriptionValue: "Sub-task 2 description",
    },
    {
      kind: "Subtask",
      depth: "Nested",
      width: 776,
      titleValue: "Sub-task 2-1",
      descriptionValue: "Sub-task 2-1 description",
    },
  ]) {
    const component = componentFrame(`Kind=${kind}, Depth=${depth}`, "HORIZONTAL");
    component.resize(width, 64);
    component.primaryAxisSizingMode = "FIXED";
    component.counterAxisSizingMode = "FIXED";
    component.primaryAxisAlignItems = "SPACE_BETWEEN";
    component.counterAxisAlignItems = "CENTER";
    bindPadding(component, "spacing/2", "spacing/3");
    bindCorners(component, "radius/control");
    fill(component, "color/bg/card");
    stroke(component, "color/border/card");

    const content = autoFrame("Content", "VERTICAL");
    bindGap(content, "spacing/1");
    const title = textNode(titleValue, {
      name: "Title Field",
      size: 13,
      lineHeight: 18,
      color: "color/text/primary",
    });
    const description = textNode(descriptionValue, {
      name: "Description Field",
      size: 12,
      lineHeight: 18,
      color: "color/text/secondary",
    });
    content.appendChild(title);
    content.appendChild(description);
    component.appendChild(content);

    if (kind === "Subtask") {
      const remove = fixedAutoFrame("Remove Subtask", "HORIZONTAL", 32, 32);
      remove.primaryAxisAlignItems = "CENTER";
      remove.counterAxisAlignItems = "CENTER";
      remove.appendChild(trashIcon.createInstance());
      component.appendChild(remove);
    }
    variants.push(component);
  }
  const set = figma.combineAsVariants(variants, parent);
  set.name = "Task Editor Row";
  set.description =
    "Reusable main-task and subtask editor card with root and nested hierarchy states.";
  layoutVariants(set, 1);
  return set;
}

function setTaskEditorText(instance, title, description) {
  const fields = instance.findAllWithCriteria({ types: ["TEXT"] }).filter((node) => {
    return node.name === "Title Field" || node.name === "Description Field";
  });
  const titleField = fields.find((node) => node.name === "Title Field");
  const descriptionField = fields.find((node) => node.name === "Description Field");
  if (titleField) titleField.characters = title;
  if (descriptionField) descriptionField.characters = description;
}

function createMetadataFieldSet(parent, input, badgeSet) {
  const variants = [];
  for (const [kind, label, badgeKind, value, placeholder] of [
    ["Context", "CONTEXTS", "Kind=Context", "@desk", "Add contexts…"],
    ["Project", "PROJECTS", "Kind=Project", "+octarine/launch", "Add projects…"],
    ["Tag", "TAGS", "Kind=Tag", "#frontend", "Add tags…"],
  ]) {
    const component = componentFrame(`Kind=${kind}`, "VERTICAL");
    component.resize(254, 92);
    component.primaryAxisSizingMode = "FIXED";
    component.counterAxisSizingMode = "FIXED";
    component.counterAxisAlignItems = "MIN";
    bindGap(component, "spacing/2");
    component.appendChild(
      textNode(label, {
        font: FONT.semibold,
        size: 10,
        lineHeight: 14,
        color: "color/text/muted",
      }),
    );
    const badge = variant(badgeSet, [badgeKind]).createInstance();
    setInstanceText(badge, "Label", value);
    component.appendChild(badge);
    const add = input.createInstance();
    setInstanceText(add, "Value", placeholder);
    add.resize(254, 30);
    component.appendChild(add);
    variants.push(component);
  }
  const set = figma.combineAsVariants(variants, parent);
  set.name = "Metadata Field";
  set.description = "Context, project, and tag editor with current values and add input.";
  layoutVariants(set, 3);
  return set;
}

function createJournalEditor(parent, buttonSet) {
  const component = componentFrame("Daily Journal Editor", "VERTICAL");
  component.resize(904, 220);
  component.primaryAxisSizingMode = "FIXED";
  component.counterAxisSizingMode = "FIXED";
  bindCorners(component, "radius/card");
  fill(component, "color/bg/card");
  stroke(component, "color/border/card");
  const header = fixedAutoFrame("Journal Header", "HORIZONTAL", 902, 62);
  header.primaryAxisAlignItems = "SPACE_BETWEEN";
  header.counterAxisAlignItems = "CENTER";
  bindPadding(header, "spacing/3", "spacing/4");
  stroke(header, "color/border/card");
  const identity = autoFrame("Journal Identity", "VERTICAL");
  bindGap(identity, "spacing/1");
  identity.appendChild(
    textNode(`${isoDate()}.md`, { font: FONT.semibold, size: 14, lineHeight: 20 }),
  );
  identity.appendChild(
    textNode(`/visual/journal/${isoDate()}.md`, {
      size: 11,
      lineHeight: 16,
      color: "color/text/muted",
    }),
  );
  header.appendChild(identity);
  const actions = autoFrame("Journal Actions", "HORIZONTAL");
  bindGap(actions, "spacing/2");
  actions.appendChild(
    instanceWithText(variant(buttonSet, ["Style=Secondary", "State=Disabled"]), {
      Label: "Save (Cmd+S)",
    }),
  );
  actions.appendChild(
    instanceWithText(variant(buttonSet, ["Style=Secondary", "State=Default"]), {
      Label: "Close",
    }),
  );
  header.appendChild(actions);
  component.appendChild(header);
  const editor = fixedAutoFrame("Editor Surface", "HORIZONTAL", 902, 156);
  fill(editor, "color/bg/card", 0.72);
  const gutter = fixedAutoFrame("Line Numbers", "VERTICAL", 34, 156);
  bindPadding(gutter, "spacing/2", "spacing/2");
  gutter.counterAxisAlignItems = "MAX";
  gutter.appendChild(
    textNode("1\n2\n3\n4\n5\n6", { size: 12, lineHeight: 22, color: "color/text/muted" }),
  );
  editor.appendChild(gutter);
  const source = fixedAutoFrame("Journal Source", "VERTICAL", 868, 156);
  bindPadding(source, "spacing/2", "spacing/2");
  source.appendChild(
    textNode(
      `# Journal — ${isoDate()}\n\n## Focus\n\nKeep the visual verification loop fast and explicit.`,
      {
        font: FONT.medium,
        size: 12,
        lineHeight: 22,
        color: "color/text/secondary",
        width: 830,
      },
    ),
  );
  editor.appendChild(source);
  component.appendChild(editor);
  component.description =
    "Daily journal editor with file identity, actions, gutter, and Markdown source.";
  parent.appendChild(component);
  return component;
}

function createSidebar(parent, navSet, icons) {
  const variants = [];
  for (const [activeLabel, dataState] of [
    ["All Tasks", "Populated"],
    ["Schedule Events", "Populated"],
    ["All Tasks", "Empty"],
  ]) {
    const component = componentFrame(`Active=${activeLabel}, Data=${dataState}`, "VERTICAL");
    component.resize(280, 1024);
    component.primaryAxisSizingMode = "FIXED";
    component.counterAxisSizingMode = "FIXED";
    component.counterAxisAlignItems = "MIN";
    bindPadding(component, "spacing/8", "spacing/6");
    bindGap(component, "spacing/4");
    fill(component, "color/bg/sidebar");
    component.appendChild(
      textNode("Octarine ■", {
        font: FONT.semibold,
        size: 26,
        lineHeight: 32,
        color: "color/accent/violet",
      }),
    );
    component.appendChild(
      textNode("SMART VIEWS", {
        font: FONT.semibold,
        size: 10,
        lineHeight: 14,
        color: "color/text/muted",
      }),
    );
    for (const [label, icon] of [
      ["All Tasks", icons.inbox],
      ["Not Started", icons.circle],
      ["In Progress", icons.progress],
      ["Schedule Events", icons.calendar],
    ]) {
      const state = label === activeLabel ? "State=Active" : "State=Default";
      const instance = variant(navSet, [state]).createInstance();
      setInstanceText(instance, "Label", label);
      const iconKey = Object.keys(instance.componentProperties).find((key) =>
        key.startsWith("Icon"),
      );
      if (iconKey) instance.setProperties({ [iconKey]: icon.id });
      component.appendChild(instance);
    }
    const sections = [
      ["JOURNALS", "▣  Expand"],
      ["NOTES", "Expand"],
      ["CUSTOM QUERY DASHBOARDS", "◇  Design follow-up"],
    ];
    if (dataState === "Populated") {
      sections.push(
        ["PROJECTS", "+  octarine\n    +  launch\n    +  ui"],
        ["CONTEXTS", "◇  @desk\n◇  @laptop\n◇  @team"],
        ["TAGS", "#  #frontend\n#  #responsive\n#  #design-system"],
      );
    }
    for (const [heading, body] of sections) {
      component.appendChild(
        textNode(heading, {
          font: FONT.semibold,
          size: 10,
          lineHeight: 14,
          color: "color/text/muted",
        }),
      );
      component.appendChild(
        textNode(body, {
          size: 12,
          lineHeight: 24,
          color: "color/text/secondary",
          width: 220,
        }),
      );
    }
    component.appendChild(
      textNode("ACTIVE VAULT PATH    ✎\n/visual/vault", {
        size: 10,
        lineHeight: 18,
        color: "color/text/muted",
        width: 220,
      }),
    );
    component.appendChild(
      textNode("ACTIVE JOURNAL PATH    ✎\n/visual/journal", {
        size: 10,
        lineHeight: 18,
        color: "color/text/muted",
        width: 220,
      }),
    );
    variants.push(component);
  }
  const set = figma.combineAsVariants(variants, parent);
  set.name = "Sidebar";
  set.description = "Persistent navigation with active-view and populated/empty data variants.";
  layoutVariants(set, 2);
  return set;
}

async function buildComponents(componentsPage, viewsPage) {
  await figma.setCurrentPageAsync(viewsPage);
  removeExactTopLevel(viewsPage, GENERATED_VIEWS);
  await figma.setCurrentPageAsync(componentsPage);
  removeExactTopLevel(componentsPage, GENERATED_COMPONENTS);
  const root = autoFrame(GENERATED_COMPONENTS, "VERTICAL");
  root.resize(1400, 100);
  root.counterAxisSizingMode = "FIXED";
  root.primaryAxisSizingMode = "AUTO";
  bindPadding(root, "spacing/12");
  bindGap(root, "spacing/12");
  fill(root, "color/bg/canvas");
  componentsPage.appendChild(root);
  root.x = 0;
  root.y = 0;
  root.appendChild(
    textNode("Octarine Components", {
      font: FONT.semibold,
      size: 36,
      lineHeight: 44,
    }),
  );
  root.appendChild(
    textNode("Reusable, token-bound primitives derived from the rendered visual fixtures.", {
      size: 14,
      lineHeight: 20,
      color: "color/text/secondary",
      width: 1100,
    }),
  );
  const iconSection = sectionHeading(
    "Icons",
    "Editable SVG icons used through component instances and swap properties.",
  );
  const iconRow = autoFrame("Icons / Row", "HORIZONTAL");
  bindGap(iconRow, "spacing/6");
  const iconSvg = {
    inbox:
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 4h16v16H4zM4 13h4l2 3h4l2-3h4" stroke="#9CA3AF" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    circle:
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="12" cy="12" r="8" stroke="#9CA3AF" stroke-width="1.7"/><path d="m9 12 2 2 4-4" stroke="#9CA3AF" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    progress:
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M20 12a8 8 0 1 1-8-8" stroke="#A78BFA" stroke-width="1.7" stroke-linecap="round"/></svg>',
    calendar:
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><rect x="4" y="5" width="16" height="15" rx="2" stroke="#818CF8" stroke-width="1.7"/><path d="M8 3v4M16 3v4M4 9h16" stroke="#818CF8" stroke-width="1.7" stroke-linecap="round"/></svg>',
    search:
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><circle cx="11" cy="11" r="7" stroke="#6B7280" stroke-width="1.7"/><path d="m16 16 4 4" stroke="#6B7280" stroke-width="1.7" stroke-linecap="round"/></svg>',
    trash:
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" stroke="#F87171" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    edit: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" stroke="#818CF8" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };
  const icons = {};
  for (const [name, svg] of Object.entries(iconSvg)) {
    icons[name] = iconComponent(name[0].toUpperCase() + name.slice(1), svg);
    iconRow.appendChild(icons[name]);
  }
  iconSection.appendChild(iconRow);
  root.appendChild(iconSection);
  const atoms = sectionHeading(
    "Controls and metadata",
    "Compact atoms with variants and editable component properties.",
  );
  const atomRow = autoFrame("Controls / Row", "HORIZONTAL");
  bindGap(atomRow, "spacing/8");
  atoms.appendChild(atomRow);
  root.appendChild(atoms);
  const checkboxSet = createCheckboxSet(atomRow);
  const badgeSet = createBadgeSet(atomRow);
  const buttonSet = createButtonSet(atomRow);
  const navigation = sectionHeading(
    "Navigation and inputs",
    "Shared navigation and form controls used across every fixture view.",
  );
  const navRow = autoFrame("Navigation / Row", "HORIZONTAL");
  bindGap(navRow, "spacing/8");
  navigation.appendChild(navRow);
  root.appendChild(navigation);
  const navSet = createNavItemSet(navRow, icons.inbox);
  const search = createSearchField(navRow, icons.search);
  const input = createInputField(navRow);
  const content = sectionHeading(
    "Content",
    "Reusable content surfaces for timelines, task hierarchy, and the month grid.",
  );
  const contentRow = autoFrame("Content / Row", "HORIZONTAL");
  bindGap(contentRow, "spacing/8");
  content.appendChild(contentRow);
  root.appendChild(content);
  const eventCard = createEventCard(contentRow);
  const taskCard = createTaskCard(contentRow, checkboxSet, badgeSet, icons.edit);
  const compactTaskCard = createCompactTaskCard(contentRow, checkboxSet, badgeSet, icons.edit);
  const calendarCellSet = createCalendarCellSet(contentRow);
  const editors = sectionHeading(
    "Editors",
    "Reusable task and journal editing surfaces used by the modal and dashboard.",
  );
  const editorRow = autoFrame("Editors / Column", "VERTICAL");
  bindGap(editorRow, "spacing/8");
  editors.appendChild(editorRow);
  root.appendChild(editors);
  const taskEditorRowSet = createTaskEditorRowSet(editorRow, icons.trash);
  const metadataFieldSet = createMetadataFieldSet(editorRow, input, badgeSet);
  const journalEditor = createJournalEditor(editorRow, buttonSet);
  const structure = sectionHeading(
    "Structure",
    "The persistent app sidebar is a single reusable component across all views.",
  );
  root.appendChild(structure);
  const sidebar = createSidebar(structure, navSet, icons);
  return {
    root,
    icons,
    checkboxSet,
    badgeSet,
    buttonSet,
    navSet,
    search,
    input,
    eventCard,
    taskCard,
    compactTaskCard,
    calendarCellSet,
    taskEditorRowSet,
    metadataFieldSet,
    journalEditor,
    sidebar,
  };
}

function instanceWithText(component, properties) {
  const instance = component.createInstance();
  for (const [prefix, value] of Object.entries(properties)) {
    setInstanceText(instance, prefix, value);
  }
  return instance;
}

function screenHeader(title) {
  const header = autoFrame("View Header", "VERTICAL");
  bindGap(header, "spacing/1");
  header.appendChild(textNode(title, { font: FONT.semibold, size: 34, lineHeight: 42 }));
  header.appendChild(
    textNode("Sub-millisecond plaintext organization", {
      size: 14,
      lineHeight: 20,
      color: "color/text/secondary",
    }),
  );
  return header;
}

function viewCard(title, screen) {
  const card = autoFrame(`View / ${title}`, "VERTICAL");
  bindGap(card, "spacing/3");
  card.appendChild(
    textNode(title, {
      font: FONT.semibold,
      size: 16,
      lineHeight: 22,
      color: "color/text/secondary",
    }),
  );
  card.appendChild(screen);
  return card;
}

function baseScreen(
  name,
  height,
  registry,
  sidebarState = "Active=All Tasks",
  dataState = "Data=Populated",
) {
  const screen = fixedAutoFrame(name, "HORIZONTAL", 1280, height);
  fill(screen, "color/bg/canvas");
  screen.clipsContent = true;
  const sidebar = variant(registry.sidebar, [sidebarState, dataState]).createInstance();
  sidebar.resize(280, height);
  screen.appendChild(sidebar);
  const content = fixedAutoFrame("Main Content", "VERTICAL", 1000, height);
  bindPadding(content, "spacing/12");
  bindGap(content, "spacing/8");
  fill(content, "color/bg/canvas");
  screen.appendChild(content);
  return { screen, content };
}

function dashboardScreen(registry, empty = false) {
  const { screen, content } = baseScreen(
    empty ? "Empty State" : "Dashboard",
    1024,
    registry,
    "Active=All Tasks",
    empty ? "Data=Empty" : "Data=Populated",
  );
  content.appendChild(screenHeader("Inbox Dashboard"));
  content.appendChild(registry.search.createInstance());
  const columns = autoFrame("Dashboard Columns", "HORIZONTAL");
  bindGap(columns, "spacing/8");
  const events = fixedAutoFrame("Events Timeline", "VERTICAL", 420, 360);
  events.primaryAxisSizingMode = "AUTO";
  bindGap(events, "spacing/3");
  events.appendChild(
    textNode("Events Timeline 📅", {
      font: FONT.semibold,
      size: 18,
      lineHeight: 24,
    }),
  );
  events.appendChild(
    textNode("TODAY'S SCHEDULE", {
      font: FONT.semibold,
      size: 11,
      lineHeight: 15,
      color: "color/text/muted",
    }),
  );
  if (empty) {
    events.appendChild(
      textNode("No events scheduled for today.", {
        size: 13,
        lineHeight: 19,
        color: "color/text/muted",
      }),
    );
    events.appendChild(
      textNode("UPCOMING EVENTS", {
        font: FONT.semibold,
        size: 11,
        lineHeight: 15,
        color: "color/text/muted",
      }),
    );
    events.appendChild(
      textNode("No upcoming future events.", {
        size: 13,
        lineHeight: 19,
        color: "color/text/muted",
      }),
    );
  } else {
    events.appendChild(
      instanceWithText(registry.eventCard, {
        Time: "09:30",
        Title: "Design systems stand-up",
      }),
    );
    events.appendChild(
      instanceWithText(registry.eventCard, {
        Time: "14:00",
        Title: "Octarine interaction review",
      }),
    );
    events.appendChild(
      textNode("UPCOMING EVENTS", {
        font: FONT.semibold,
        size: 11,
        lineHeight: 15,
        color: "color/text/muted",
      }),
    );
    events.appendChild(
      instanceWithText(registry.eventCard, {
        Time: `${shortDate(fixtureDate(1))}  11:00`,
        Title: "Release planning workshop",
      }),
    );
  }
  const tasks = fixedAutoFrame("Most Pressing Tasks", "VERTICAL", 420, 360);
  tasks.primaryAxisSizingMode = "AUTO";
  bindGap(tasks, "spacing/3");
  tasks.appendChild(
    textNode("Most Pressing Tasks 🚀", {
      font: FONT.semibold,
      size: 18,
      lineHeight: 24,
    }),
  );
  if (empty) {
    tasks.appendChild(
      textNode("Clear Space! No active tasks found.", {
        size: 13,
        lineHeight: 19,
        color: "color/text/muted",
      }),
    );
  } else {
    tasks.appendChild(registry.taskCard.createInstance());
    tasks.appendChild(registry.compactTaskCard.createInstance());
  }
  columns.appendChild(events);
  columns.appendChild(tasks);
  content.appendChild(columns);
  content.appendChild(
    textNode("▣ Today's Daily Journal Note", {
      font: FONT.semibold,
      size: 18,
      lineHeight: 24,
    }),
  );
  content.appendChild(registry.journalEditor.createInstance());
  return screen;
}

function calendarScreen(registry) {
  const { screen, content } = baseScreen("Calendar", 1024, registry, "Active=Schedule Events");
  content.appendChild(screenHeader("Calendar Timeline"));
  content.appendChild(registry.search.createInstance());
  const controls = fixedAutoFrame("Calendar Controls", "HORIZONTAL", 904, 58);
  controls.primaryAxisAlignItems = "CENTER";
  controls.counterAxisAlignItems = "CENTER";
  bindPadding(controls, "spacing/3", "spacing/4");
  bindGap(controls, "spacing/5");
  bindCorners(controls, "radius/card");
  fill(controls, "color/bg/card");
  stroke(controls, "color/border/card");
  for (const [label, color, font] of [
    ["Week Grid", "color/text/muted", FONT.regular],
    ["Month View", "color/accent/violet", FONT.medium],
    ["‹", "color/text/primary", FONT.semibold],
    [monthLabel(fixtureDate()), "color/text/primary", FONT.semibold],
    ["›", "color/text/primary", FONT.semibold],
    ["□  Show Future Repetitions", "color/text/secondary", FONT.regular],
  ])
    controls.appendChild(textNode(label, { font, size: 13, lineHeight: 20, color }));
  content.appendChild(controls);
  const grid = autoFrame("Month Grid", "VERTICAL");
  bindGap(grid, "spacing/2");
  const today = fixtureDate();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const days = Array.from(
    { length: 42 },
    (_, index) =>
      new Date(today.getFullYear(), today.getMonth(), 1 - firstOfMonth.getDay() + index),
  );
  for (let rowIndex = 0; rowIndex < 6; rowIndex += 1) {
    const row = autoFrame(`Week ${rowIndex + 1}`, "HORIZONTAL");
    bindGap(row, "spacing/2");
    for (let column = 0; column < 7; column += 1) {
      const index = rowIndex * 7 + column;
      const date = days[index];
      const day = String(date.getDate());
      const state =
        date.getMonth() !== today.getMonth()
          ? "State=Other Month"
          : isoDate(date) === isoDate(today)
            ? "State=Today"
            : "State=Default";
      const cell = variant(registry.calendarCellSet, [state]).createInstance();
      setInstanceText(cell, "Date", day);
      if (isoDate(date) === isoDate(today)) {
        setInstanceText(cell, "Event 1", "09:30 Design stand-up");
        setInstanceText(cell, "Event 2", "14:00 Interaction review");
      } else if (isoDate(date) === isoDate(fixtureDate(1))) {
        setInstanceText(cell, "Event 1", "11:00 Release planning");
      }
      row.appendChild(cell);
    }
    grid.appendChild(row);
  }
  content.appendChild(grid);
  return screen;
}

function modalScreen(registry, dashboard) {
  const screen = figma.createFrame();
  screen.name = "Task Modal";
  screen.resize(1280, 1024);
  screen.clipsContent = true;
  fill(screen, "color/bg/canvas");
  const background = dashboard.clone();
  background.name = "Dashboard Background";
  background.x = 0;
  background.y = 0;
  background.opacity = 0.24;
  background.effects = [{ type: "LAYER_BLUR", radius: 4, visible: true }];
  screen.appendChild(background);
  const overlay = figma.createRectangle();
  overlay.name = "Modal Backdrop";
  overlay.resize(1280, 1024);
  overlay.x = 0;
  overlay.y = 0;
  fill(overlay, "color/bg/overlay");
  screen.appendChild(overlay);
  const modal = fixedAutoFrame("Edit Task Modal", "VERTICAL", 860, 820);
  modal.x = 210;
  modal.y = 90;
  bindCorners(modal, "radius/modal");
  fill(modal, "color/bg/sidebar");
  stroke(modal, "color/border/glow");
  modal.effects = [
    {
      type: "DROP_SHADOW",
      color: { r: 0, g: 0, b: 0, a: 0.45 },
      offset: { x: 0, y: 20 },
      radius: 50,
      spread: -12,
      visible: true,
      blendMode: "NORMAL",
    },
  ];
  const header = fixedAutoFrame("Modal Header", "HORIZONTAL", 860, 66);
  header.primaryAxisAlignItems = "SPACE_BETWEEN";
  header.counterAxisAlignItems = "CENTER";
  bindPadding(header, "spacing/4", "spacing/6");
  stroke(header, "color/border/card");
  header.appendChild(
    textNode("Edit Task", {
      font: FONT.semibold,
      size: 20,
      lineHeight: 26,
    }),
  );
  header.appendChild(
    textNode("Markdown    ×", {
      size: 13,
      lineHeight: 18,
      color: "color/text/secondary",
    }),
  );
  modal.appendChild(header);
  const body = fixedAutoFrame("Modal Body", "VERTICAL", 860, 688);
  body.clipsContent = true;
  bindPadding(body, "spacing/6", "spacing/8");
  bindGap(body, "spacing/3");
  const mainTask = variant(registry.taskEditorRowSet, ["Kind=Main", "Depth=Root"]).createInstance();
  mainTask.name = "Main Task";
  setTaskEditorText(mainTask, "Task 1", "Task 1 description");
  body.appendChild(mainTask);
  body.appendChild(
    textNode("SUBTASKS", {
      font: FONT.semibold,
      size: 10,
      lineHeight: 14,
      color: "color/text/muted",
    }),
  );
  for (const [index, title, description, depth] of [
    [1, "(B) Sub-task 1", "Add subtask description...", "Depth=Root"],
    [2, "(A) Sub-task 2", "Sub-task 2 description", "Depth=Root"],
    [3, "Sub-task 2-1", "Sub-task 2-1 description", "Depth=Nested"],
  ]) {
    const subtask = variant(registry.taskEditorRowSet, ["Kind=Subtask", depth]).createInstance();
    subtask.name = `Subtask ${index}`;
    setTaskEditorText(subtask, title, description);
    body.appendChild(subtask);
  }
  const addSubtask = fixedAutoFrame("Add Subtask", "HORIZONTAL", 796, 34);
  addSubtask.primaryAxisAlignItems = "CENTER";
  addSubtask.counterAxisAlignItems = "CENTER";
  bindCorners(addSubtask, "radius/control");
  stroke(addSubtask, "color/accent/violet", 0.55);
  addSubtask.appendChild(
    textNode("+ Add subtask", {
      font: FONT.medium,
      size: 12,
      lineHeight: 18,
      color: "color/accent/violet",
    }),
  );
  body.appendChild(addSubtask);
  const metadata = autoFrame("Metadata Fields", "HORIZONTAL");
  bindGap(metadata, "spacing/4");
  for (const [label, value] of [
    ["PRIORITY", "High (A)"],
    ["DUE DATE", "dd / mm / yyyy"],
    ["STATUS", "Not started"],
    ["ESTIMATE", "e.g. 2h, 30m, 3d"],
  ]) {
    const group = fixedAutoFrame(`${label} Field`, "VERTICAL", 186, 58);
    bindGap(group, "spacing/1");
    group.appendChild(
      textNode(label, {
        font: FONT.semibold,
        size: 10,
        lineHeight: 14,
        color: "color/text/muted",
      }),
    );
    const field = instanceWithText(registry.input, { Value: value });
    field.resize(186, 36);
    group.appendChild(field);
    metadata.appendChild(group);
  }
  body.appendChild(metadata);
  const recurrenceGroup = fixedAutoFrame("RECURRENCE Field", "VERTICAL", 796, 58);
  bindGap(recurrenceGroup, "spacing/1");
  recurrenceGroup.appendChild(
    textNode("RECURRENCE", {
      font: FONT.semibold,
      size: 10,
      lineHeight: 14,
      color: "color/text/muted",
    }),
  );
  const recurrence = instanceWithText(registry.input, {
    Value: "e.g. every weekday or 0 9 * * 1-5",
  });
  recurrence.resize(796, 36);
  recurrenceGroup.appendChild(recurrence);
  body.appendChild(recurrenceGroup);
  const organization = autoFrame("Organization Metadata", "HORIZONTAL");
  bindGap(organization, "spacing/4");
  for (const kind of ["Kind=Context", "Kind=Project", "Kind=Tag"]) {
    organization.appendChild(variant(registry.metadataFieldSet, [kind]).createInstance());
  }
  body.appendChild(organization);
  modal.appendChild(body);
  const footer = fixedAutoFrame("Modal Footer", "HORIZONTAL", 860, 66);
  footer.primaryAxisAlignItems = "SPACE_BETWEEN";
  footer.counterAxisAlignItems = "CENTER";
  bindPadding(footer, "spacing/3", "spacing/6");
  footer.appendChild(
    instanceWithText(variant(registry.buttonSet, ["Style=Danger", "State=Default"]), {
      Label: "Delete Task",
    }),
  );
  const actions = autoFrame("Footer Actions", "HORIZONTAL");
  bindGap(actions, "spacing/3");
  actions.appendChild(
    instanceWithText(variant(registry.buttonSet, ["Style=Secondary", "State=Default"]), {
      Label: "Cancel",
    }),
  );
  actions.appendChild(
    instanceWithText(variant(registry.buttonSet, ["Style=Primary", "State=Default"]), {
      Label: "Save Changes",
    }),
  );
  footer.appendChild(actions);
  modal.appendChild(footer);
  screen.appendChild(modal);
  return screen;
}

async function buildViews(viewsPage, registry) {
  await figma.setCurrentPageAsync(viewsPage);
  const root = autoFrame(GENERATED_VIEWS, "VERTICAL");
  root.resize(2760, 100);
  root.counterAxisSizingMode = "FIXED";
  root.primaryAxisSizingMode = "AUTO";
  bindPadding(root, "spacing/12");
  bindGap(root, "spacing/8");
  fill(root, "color/bg/canvas");
  viewsPage.appendChild(root);
  root.x = 0;
  root.y = 0;
  root.appendChild(
    textNode("Octarine Visual Fixtures", {
      font: FONT.semibold,
      size: 36,
      lineHeight: 44,
    }),
  );
  root.appendChild(
    textNode("Editable views assembled from reusable local components and shared variables.", {
      size: 14,
      lineHeight: 20,
      color: "color/text/secondary",
    }),
  );
  const rowOne = autoFrame("Views / Row 1", "HORIZONTAL");
  bindGap(rowOne, "spacing/8");
  const dashboard = dashboardScreen(registry, false);
  rowOne.appendChild(viewCard("Dashboard", dashboard));
  rowOne.appendChild(viewCard("Calendar", calendarScreen(registry)));
  root.appendChild(rowOne);
  const rowTwo = autoFrame("Views / Row 2", "HORIZONTAL");
  bindGap(rowTwo, "spacing/8");
  rowTwo.appendChild(viewCard("Task Modal", modalScreen(registry, dashboard)));
  rowTwo.appendChild(viewCard("Empty State", dashboardScreen(registry, true)));
  root.appendChild(rowTwo);
  figma.currentPage.selection = [root];
  figma.viewport.scrollAndZoomIntoView([root]);
  return root;
}

async function validateBuild(componentsPage, viewsPage) {
  await componentsPage.loadAsync();
  await viewsPage.loadAsync();
  const componentRoot = componentsPage.children.find((node) => node.name === GENERATED_COMPONENTS);
  const viewsRoot = viewsPage.children.find((node) => node.name === GENERATED_VIEWS);
  if (!componentRoot || !viewsRoot) throw new Error("Generated roots are missing after build.");
  const components = componentRoot.findAllWithCriteria({ types: ["COMPONENT", "COMPONENT_SET"] });
  const instances = viewsRoot.findAllWithCriteria({ types: ["INSTANCE"] });
  const screens = viewsRoot
    .findAllWithCriteria({ types: ["FRAME"] })
    .filter((node) => ["Dashboard", "Calendar", "Task Modal", "Empty State"].includes(node.name));
  const unnamed = [...components, ...instances].filter((node) => /^Component \d+$/.test(node.name));
  const textNodes = viewsRoot.findAllWithCriteria({ types: ["TEXT"] });
  const wrongFonts = textNodes.filter(
    (node) => node.fontName !== figma.mixed && node.fontName.family !== "SF Pro",
  );
  const visibleText = textNodes.map((node) => node.characters);
  const requiredText = [
    "#frontend",
    "@desk",
    "+octarine/launch",
    "Delete Task",
    "Cancel",
    "Save Changes",
    "+ Add subtask",
    "Audit the calendar at compact widths",
    "Today's Daily Journal Note",
    `${isoDate()}.md`,
    `/visual/journal/${isoDate()}.md`,
    "Save (Cmd+S)",
    "Close",
    "0 subtasks",
    "ACTIVE VAULT PATH",
    "ACTIVE JOURNAL PATH",
    "PRIORITY",
    "DUE DATE",
    "STATUS",
    "ESTIMATE",
    "RECURRENCE",
  ];
  const missingText = requiredText.filter(
    (expected) => !visibleText.some((value) => value.includes(expected)),
  );
  const genericButtonLabels = visibleText.filter((value) => value === "Button").length;
  const requiredFrames = [
    "Subtask 1",
    "Subtask 2",
    "Subtask 3",
    "Add Subtask",
    "Daily Journal Editor",
    "Journal Header",
    "Editor Surface",
    "Line Numbers",
  ];
  const renderedNodeNames = viewsRoot.findAll(() => true).map((node) => node.name);
  const missingFrames = requiredFrames.filter((name) => !renderedNodeNames.includes(name));
  const calendar = screens.find((screen) => screen.name === "Calendar");
  let calendarSidebar;
  for (const instance of calendar?.findAllWithCriteria({ types: ["INSTANCE"] }) || []) {
    const mainComponent = await instance.getMainComponentAsync();
    if (
      mainComponent?.parent?.type === "COMPONENT_SET" &&
      mainComponent.parent.name === "Sidebar"
    ) {
      calendarSidebar = instance;
      break;
    }
  }
  const calendarSidebarActive = calendarSidebar?.variantProperties?.Active;
  const requiredComponents = [
    "Daily Journal Editor",
    "Task Editor Row",
    "Metadata Field",
    "Task Card / Complex",
    "Task Card / Compact",
    "Sidebar",
  ];
  const componentNames = components.map((node) => node.name);
  const missingComponents = requiredComponents.filter((name) => !componentNames.includes(name));
  const wrongScreenHeights = screens.filter((screen) => screen.height !== 1024);
  const viewCards = viewsRoot
    .findAllWithCriteria({ types: ["FRAME"] })
    .filter((node) => node.name.startsWith("View / "));
  const compressedViewCards = viewCards.filter((node) => node.width < 1280);
  const viewRows = viewsRoot
    .findAllWithCriteria({ types: ["FRAME"] })
    .filter((node) => node.name.startsWith("Views / Row"));
  const overlappingViewPairs = [];
  for (const row of viewRows) {
    const cards = row.children.filter((node) => node.name.startsWith("View / "));
    for (let index = 1; index < cards.length; index += 1) {
      const previous = cards[index - 1];
      const current = cards[index];
      if (current.x < previous.x + previous.width) {
        overlappingViewPairs.push(`${previous.name} ↔ ${current.name}`);
      }
    }
  }
  if (
    compressedViewCards.length ||
    overlappingViewPairs.length ||
    missingText.length ||
    missingFrames.length ||
    missingComponents.length ||
    wrongScreenHeights.length ||
    genericButtonLabels ||
    calendarSidebarActive !== "Schedule Events"
  ) {
    throw new Error(
      [
        compressedViewCards.length
          ? `Compressed view cards: ${compressedViewCards.map((node) => node.name).join(", ")}`
          : "",
        overlappingViewPairs.length
          ? `Overlapping view cards: ${overlappingViewPairs.join(", ")}`
          : "",
        missingText.length ? `Missing required text: ${missingText.join(", ")}` : "",
        missingFrames.length ? `Missing required controls: ${missingFrames.join(", ")}` : "",
        missingComponents.length
          ? `Missing reusable components: ${missingComponents.join(", ")}`
          : "",
        wrongScreenHeights.length
          ? `Wrong screen heights: ${wrongScreenHeights.map((node) => `${node.name}=${node.height}`).join(", ")}`
          : "",
        genericButtonLabels ? `${genericButtonLabels} generic Button label(s) remain` : "",
        calendarSidebarActive !== "Schedule Events"
          ? `Calendar sidebar active state is ${calendarSidebarActive || "missing"}`
          : "",
      ]
        .filter(Boolean)
        .join(". "),
    );
  }
  return {
    componentCount: components.length,
    instanceCount: instances.length,
    screens: screens.map((screen) => screen.name),
    unnamedCount: unnamed.length,
    wrongFontCount: wrongFonts.length,
    missingText,
    missingFrames,
    missingComponents,
    wrongScreenHeights: wrongScreenHeights.map((node) => ({
      name: node.name,
      height: node.height,
    })),
    genericButtonLabels,
    calendarSidebarActive,
    viewCardWidths: viewCards.map((node) => ({ name: node.name, width: node.width })),
    overlappingViewPairs,
  };
}

async function buildAll() {
  await loadDocument();
  const componentsPage = figma.root.children.find((page) => page.name === "Components");
  const viewsPage = figma.root.children.find((page) => page.name === "Views");
  if (!componentsPage || !viewsPage) {
    throw new Error("Expected Components and Views pages were not found.");
  }
  figma.ui.postMessage({ type: "build-progress", message: "Building reusable components…" });
  const registry = await buildComponents(componentsPage, viewsPage);
  figma.ui.postMessage({ type: "build-progress", message: "Assembling four fixture views…" });
  const viewsRoot = await buildViews(viewsPage, registry);
  figma.ui.postMessage({
    type: "build-progress",
    message: "Validating structure, instances, and fonts…",
  });
  const validation = await validateBuild(componentsPage, viewsPage);
  return { rootId: viewsRoot.id, validation };
}

async function sendConnectionStatus() {
  try {
    const details = await inspectConnection();
    figma.ui.postMessage({ type: "connection-status", ok: true, details });
  } catch (error) {
    figma.ui.postMessage({
      type: "connection-status",
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

figma.ui.onmessage = async (message) => {
  if (message.type === "inspect") {
    await sendConnectionStatus();
    return;
  }
  if (message.type === "build-all") {
    try {
      const result = await buildAll();
      figma.ui.postMessage({ type: "build-complete", ok: true, result });
    } catch (error) {
      figma.ui.postMessage({
        type: "build-complete",
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }
  if (message.type === "close") figma.closePlugin();
};

void sendConnectionStatus();
