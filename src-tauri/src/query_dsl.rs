use regex::Regex;
use std::sync::OnceLock;

static OP_RE: OnceLock<Regex> = OnceLock::new();
static COMP_RE: OnceLock<Regex> = OnceLock::new();

fn get_op_re() -> &'static Regex {
    OP_RE.get_or_init(|| Regex::new(r"^(<=|>=|!=|=|<|>)").unwrap())
}

fn get_comp_re() -> &'static Regex {
    COMP_RE.get_or_init(|| Regex::new(r"^(due|status|type)(<=|>=|!=|=|<|>)(.+)$").unwrap())
}

#[derive(Debug, Clone, PartialEq)]
pub enum Token {
    And,
    Or,
    Not,
    LParen,
    RParen,
    Term(String),
}

fn tokenize(query: &str) -> Vec<Token> {
    let mut tokens = Vec::new();
    let chars: Vec<char> = query.chars().collect();
    let mut i = 0;

    while i < chars.len() {
        let c = chars[i];

        if c.is_whitespace() {
            i += 1;
            continue;
        }

        if c == '(' {
            tokens.push(Token::LParen);
            i += 1;
            continue;
        }

        if c == ')' {
            tokens.push(Token::RParen);
            i += 1;
            continue;
        }

        // Parse operators or terms
        let start = i;
        while i < chars.len() && !chars[i].is_whitespace() && chars[i] != '(' && chars[i] != ')' {
            i += 1;
        }
        let word: String = chars[start..i].iter().collect();
        let upper_word = word.to_uppercase();

        match upper_word.as_str() {
            "AND" => tokens.push(Token::And),
            "OR" => tokens.push(Token::Or),
            "NOT" => tokens.push(Token::Not),
            _ => {
                // If it's a field term like "due <= today", we might have spaces around operators.
                // Let's support coalescing field comparisons.
                if (word == "due" || word == "status" || word == "type") && i < chars.len() {
                    // Peek ahead to see if there is an operator like <=, >=, =, <, > or !=
                    let rest: String = chars[i..].iter().collect();
                    let trimmed = rest.trim_start();
                    let op_re = get_op_re();
                    if let Some(caps) = op_re.captures(trimmed) {
                        let op = caps.get(1).unwrap().as_str();
                        let op_len = op.len();

                        // Move cursor past the operator and find the value
                        let val_part = &trimmed[op_len..].trim_start();
                        let val_end = val_part
                            .find(|c: char| c.is_whitespace() || c == '(' || c == ')')
                            .unwrap_or(val_part.len());
                        let val_word = &val_part[..val_end];
                        let term_expr = format!("{}{}{}", word, op, val_word);

                        // Advance general index `i` past this expression
                        let consumed = chars.len() - rest.len()
                            + rest.find(val_word).unwrap()
                            + val_word.len();
                        i = consumed;

                        tokens.push(Token::Term(term_expr));
                        continue;
                    }
                }
                tokens.push(Token::Term(word));
            }
        }
    }
    tokens
}

pub fn compile_filter_to_sql(filter: &str) -> Result<String, String> {
    let tokens = tokenize(filter);
    if tokens.is_empty() {
        return Ok("1 = 1".to_string()); // Default matches everything
    }

    let mut sql_parts = Vec::new();
    let mut i = 0;

    while i < tokens.len() {
        match &tokens[i] {
            Token::And => sql_parts.push(" AND ".to_string()),
            Token::Or => sql_parts.push(" OR ".to_string()),
            Token::Not => sql_parts.push(" NOT ".to_string()),
            Token::LParen => sql_parts.push("(".to_string()),
            Token::RParen => sql_parts.push(")".to_string()),
            Token::Term(term) => {
                let sql_term = compile_term(term)?;
                sql_parts.push(sql_term);
            }
        }
        i += 1;
    }

    Ok(sql_parts.join(""))
}

fn compile_term(term: &str) -> Result<String, String> {
    if let Some(proj) = term.strip_prefix('+') {
        // Project filter: +work -> project = 'work' OR project LIKE 'work/%'
        Ok(format!(
            "(project = '{}' OR project LIKE '{}/%')",
            proj.replace('\'', "''"),
            proj.replace('\'', "''")
        ))
    } else if let Some(context) = term.strip_prefix('@') {
        // Context filter: @phone
        Ok(format!(
            "id IN (SELECT task_id FROM task_contexts JOIN contexts ON contexts.id = task_contexts.context_id WHERE contexts.name = '{}')",
            context.replace('\'', "''")
        ))
    } else if let Some(tag) = term.strip_prefix('#') {
        // Tag filter: #urgent
        Ok(format!(
            "id IN (SELECT task_id FROM task_tags JOIN tags ON tags.id = task_tags.tag_id WHERE tags.name = '{}')",
            tag.replace('\'', "''")
        ))
    } else if let Some(p_val) = term.strip_prefix("p:") {
        // Priority filter: p:A -> priority = 1
        let val_upper = p_val.to_uppercase();
        let p_num = match val_upper.as_str() {
            "A" | "1" => Some(1),
            "B" | "2" => Some(2),
            "C" | "3" => Some(3),
            "D" | "4" => Some(4),
            _ => p_val.parse::<i32>().ok(),
        };
        match p_num {
            Some(num) => Ok(format!("priority = {}", num)),
            None => Err(format!(
                "Invalid priority value in query: '{}' (expected A-D or an integer)",
                p_val
            )),
        }
    } else {
        // Metadata comparison term, e.g., due<=today, status=todo, type=event
        let comp_re = get_comp_re();
        if let Some(caps) = comp_re.captures(term) {
            let field = caps.get(1).unwrap().as_str();
            let op = caps.get(2).unwrap().as_str();
            let val = caps
                .get(3)
                .unwrap()
                .as_str()
                .trim_matches(|c| c == '"' || c == '\'');

            match field {
                "due" => {
                    if val == "today" {
                        Ok(format!(
                            "(due_date IS NOT NULL AND due_date {} date('now'))",
                            op
                        ))
                    } else if val == "tomorrow" {
                        Ok(format!(
                            "(due_date IS NOT NULL AND due_date {} date('now', '+1 day'))",
                            op
                        ))
                    } else {
                        // Check if it's a valid date
                        if chrono::NaiveDate::parse_from_str(val, "%Y-%m-%d").is_ok() {
                            Ok(format!(
                                "(due_date IS NOT NULL AND due_date {} '{}')",
                                op,
                                val.replace('\'', "''")
                            ))
                        } else {
                            Err(format!("Invalid date literal in query: '{}'", val))
                        }
                    }
                }
                "status" => Ok(format!("status {} '{}'", op, val.replace('\'', "''"))),
                "type" => Ok(format!("type {} '{}'", op, val.replace('\'', "''"))),
                _ => Err(format!("Unsupported query field: '{}'", field)),
            }
        } else {
            Err(format!("Invalid query term: '{}'", term))
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_tokenize() {
        let q = "(due <= today AND +work) OR #urgent";
        let tokens = tokenize(q);
        assert_eq!(
            tokens,
            vec![
                Token::LParen,
                Token::Term("due<=today".to_string()),
                Token::And,
                Token::Term("+work".to_string()),
                Token::RParen,
                Token::Or,
                Token::Term("#urgent".to_string()),
            ]
        );
    }

    #[test]
    fn test_compile_filter_to_sql() {
        let q = "due <= today AND +work/marketing AND @phone AND #urgent";
        let sql = compile_filter_to_sql(q).unwrap();
        assert!(sql.contains("(due_date IS NOT NULL AND due_date <= date('now'))"));
        assert!(sql.contains("(project = 'work/marketing' OR project LIKE 'work/marketing/%')"));
        assert!(sql.contains("contexts.name = 'phone'"));
        assert!(sql.contains("tags.name = 'urgent'"));
    }

    #[test]
    fn test_compile_parentheses() {
        let q = "(status = todo OR status = doing) AND +personal";
        let sql = compile_filter_to_sql(q).unwrap();
        assert_eq!(sql, "(status = 'todo' OR status = 'doing') AND (project = 'personal' OR project LIKE 'personal/%')");
    }

    #[test]
    fn test_compile_priority() {
        let q = "+work AND p:A";
        let sql = compile_filter_to_sql(q).unwrap();
        assert!(sql.contains("(project = 'work' OR project LIKE 'work/%')"));
        assert!(sql.contains("priority = 1"));

        let q2 = "+work AND p:1";
        let sql2 = compile_filter_to_sql(q2).unwrap();
        assert!(sql2.contains("priority = 1"));
    }
}
