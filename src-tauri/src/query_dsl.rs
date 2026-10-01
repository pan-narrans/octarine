use regex::Regex;
use rusqlite::types::Value;
use std::sync::OnceLock;

static OP_RE: OnceLock<Regex> = OnceLock::new();
static COMP_RE: OnceLock<Regex> = OnceLock::new();
static IDENT_RE: OnceLock<Regex> = OnceLock::new();

fn get_op_re() -> &'static Regex {
    OP_RE.get_or_init(|| Regex::new(r"^(<=|>=|!=|=|<|>)").unwrap())
}

fn get_comp_re() -> &'static Regex {
    COMP_RE.get_or_init(|| Regex::new(r"^(due|status|type)(<=|>=|!=|=|<|>)(.+)$").unwrap())
}

fn get_ident_re() -> &'static Regex {
    IDENT_RE.get_or_init(|| Regex::new(r"^[\p{L}\p{N}_-]+(?:/[\p{L}\p{N}_-]+)*$").unwrap())
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

#[derive(Debug, Clone, PartialEq)]
pub struct CompiledFilter {
    pub sql: String,
    pub params: Vec<Value>,
}

#[derive(Debug, Clone, PartialEq)]
enum Expression {
    Term(String),
    Not(Box<Expression>),
    And(Box<Expression>, Box<Expression>),
    Or(Box<Expression>, Box<Expression>),
}

struct Parser {
    tokens: Vec<Token>,
    position: usize,
}

impl Parser {
    fn new(tokens: Vec<Token>) -> Self {
        Self {
            tokens,
            position: 0,
        }
    }

    fn parse(mut self) -> Result<Expression, String> {
        let expression = self.parse_or()?;
        if let Some(token) = self.tokens.get(self.position) {
            return Err(format!("Unexpected token in query: {token:?}"));
        }
        Ok(expression)
    }

    fn parse_or(&mut self) -> Result<Expression, String> {
        let mut expression = self.parse_and()?;
        while self.tokens.get(self.position) == Some(&Token::Or) {
            self.position += 1;
            expression = Expression::Or(Box::new(expression), Box::new(self.parse_and()?));
        }
        Ok(expression)
    }

    fn parse_and(&mut self) -> Result<Expression, String> {
        let mut expression = self.parse_unary()?;
        while self.tokens.get(self.position) == Some(&Token::And) {
            self.position += 1;
            expression = Expression::And(Box::new(expression), Box::new(self.parse_unary()?));
        }
        Ok(expression)
    }

    fn parse_unary(&mut self) -> Result<Expression, String> {
        if self.tokens.get(self.position) == Some(&Token::Not) {
            self.position += 1;
            return Ok(Expression::Not(Box::new(self.parse_unary()?)));
        }
        self.parse_primary()
    }

    fn parse_primary(&mut self) -> Result<Expression, String> {
        match self.tokens.get(self.position).cloned() {
            Some(Token::Term(term)) => {
                self.position += 1;
                Ok(Expression::Term(term))
            }
            Some(Token::LParen) => {
                self.position += 1;
                let expression = self.parse_or()?;
                if self.tokens.get(self.position) != Some(&Token::RParen) {
                    return Err("Missing closing parenthesis in query.".to_string());
                }
                self.position += 1;
                Ok(expression)
            }
            Some(token) => Err(format!("Unexpected token in query: {token:?}")),
            None => Err("Expected a query expression.".to_string()),
        }
    }
}

pub fn compile_filter_to_sql(filter: &str) -> Result<CompiledFilter, String> {
    let tokens = tokenize(filter);
    if tokens.is_empty() {
        return Ok(CompiledFilter {
            sql: "1 = 1".to_string(),
            params: Vec::new(),
        });
    }

    let expression = Parser::new(tokens).parse()?;
    let mut params = Vec::new();
    let sql = compile_expression(&expression, &mut params)?;
    Ok(CompiledFilter { sql, params })
}

fn compile_expression(expression: &Expression, params: &mut Vec<Value>) -> Result<String, String> {
    match expression {
        Expression::Term(term) => compile_term(term, params),
        Expression::Not(inner) => Ok(format!("NOT ({})", compile_expression(inner, params)?)),
        Expression::And(left, right) => Ok(format!(
            "({} AND {})",
            compile_expression(left, params)?,
            compile_expression(right, params)?
        )),
        Expression::Or(left, right) => Ok(format!(
            "({} OR {})",
            compile_expression(left, params)?,
            compile_expression(right, params)?
        )),
    }
}

fn validate_identifier(value: &str, kind: &str) -> Result<(), String> {
    if get_ident_re().is_match(value) {
        Ok(())
    } else {
        Err(format!("Invalid {kind} value in query: '{value}'"))
    }
}

fn escape_like(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}

fn compile_term(term: &str, params: &mut Vec<Value>) -> Result<String, String> {
    if let Some(proj) = term.strip_prefix('+') {
        validate_identifier(proj, "project")?;
        params.push(Value::Text(proj.to_string()));
        params.push(Value::Text(format!("{}/%", escape_like(proj))));
        Ok("(tasks.project = ? OR tasks.project LIKE ? ESCAPE '\\')".to_string())
    } else if let Some(context) = term.strip_prefix('@') {
        validate_identifier(context, "context")?;
        params.push(Value::Text(context.to_string()));
        Ok("tasks.primary_context = ?".to_string())
    } else if let Some(tag) = term.strip_prefix('#') {
        validate_identifier(tag, "tag")?;
        params.push(Value::Text(tag.to_string()));
        Ok("tasks.id IN (SELECT task_id FROM task_tags JOIN tags ON tags.id = task_tags.tag_id WHERE tags.name = ?)".to_string())
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
            Some(num @ 1..=4) => {
                params.push(Value::Integer(num.into()));
                Ok("tasks.priority = ?".to_string())
            }
            Some(_) | None => Err(format!(
                "Invalid priority value in query: '{}' (expected A-D or 1-4)",
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
                            "(tasks.due_date IS NOT NULL AND tasks.due_date {} date('now'))",
                            op
                        ))
                    } else if val == "tomorrow" {
                        Ok(format!(
                            "(tasks.due_date IS NOT NULL AND tasks.due_date {} date('now', '+1 day'))",
                            op
                        ))
                    } else {
                        // Check if it's a valid date
                        if chrono::NaiveDate::parse_from_str(val, "%Y-%m-%d").is_ok() {
                            params.push(Value::Text(val.to_string()));
                            Ok(format!(
                                "(tasks.due_date IS NOT NULL AND tasks.due_date {op} ?)"
                            ))
                        } else {
                            Err(format!("Invalid date literal in query: '{}'", val))
                        }
                    }
                }
                "status" => {
                    if !matches!(val, "todo" | "doing" | "deferred" | "done" | "cancelled") {
                        return Err(format!("Invalid status value in query: '{val}'"));
                    }
                    params.push(Value::Text(val.to_string()));
                    Ok(format!("tasks.status {op} ?"))
                }
                "type" => {
                    if !matches!(val, "task" | "event") {
                        return Err(format!("Invalid type value in query: '{val}'"));
                    }
                    params.push(Value::Text(val.to_string()));
                    Ok(format!("tasks.type {op} ?"))
                }
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
        let compiled = compile_filter_to_sql(q).unwrap();
        assert!(compiled.sql.contains("tasks.due_date <= date('now')"));
        assert!(compiled
            .sql
            .contains("(tasks.project = ? OR tasks.project LIKE ? ESCAPE '\\')"));
        assert!(compiled.sql.contains("tasks.primary_context = ?"));
        assert!(compiled.sql.contains("tags.name = ?"));
        assert_eq!(
            compiled.params,
            vec![
                Value::Text("work/marketing".to_string()),
                Value::Text("work/marketing/%".to_string()),
                Value::Text("phone".to_string()),
                Value::Text("urgent".to_string()),
            ]
        );
    }

    #[test]
    fn test_compile_parentheses() {
        let q = "(status = todo OR status = doing) AND +personal";
        let compiled = compile_filter_to_sql(q).unwrap();
        assert_eq!(
            compiled.sql,
            "((tasks.status = ? OR tasks.status = ?) AND (tasks.project = ? OR tasks.project LIKE ? ESCAPE '\\'))"
        );
        assert_eq!(compiled.params.len(), 4);
    }

    #[test]
    fn test_compile_deferred_status() {
        let compiled = compile_filter_to_sql("status = deferred").unwrap();
        assert_eq!(compiled.sql, "tasks.status = ?");
        assert_eq!(compiled.params, vec![Value::Text("deferred".to_string())]);
    }

    #[test]
    fn test_compile_priority() {
        let q = "+work AND p:A";
        let compiled = compile_filter_to_sql(q).unwrap();
        assert!(compiled.sql.contains("tasks.priority = ?"));
        assert_eq!(compiled.params.last(), Some(&Value::Integer(1)));

        let q2 = "+work AND p:1";
        let compiled2 = compile_filter_to_sql(q2).unwrap();
        assert_eq!(compiled2.params.last(), Some(&Value::Integer(1)));
        assert!(compile_filter_to_sql("p:5").is_err());
    }

    #[test]
    fn test_rejects_invalid_grammar_and_values() {
        for query in [
            "status=todo AND",
            "AND status=todo",
            "(status=todo",
            "status=unknown",
            "type=reminder",
            "+work' OR 1=1",
        ] {
            assert!(compile_filter_to_sql(query).is_err(), "accepted: {query}");
        }
    }

    #[test]
    fn test_user_values_are_bound_parameters() {
        let compiled = compile_filter_to_sql("due=2026-08-15 AND #urgent").unwrap();
        assert!(!compiled.sql.contains("2026-08-15"));
        assert!(!compiled.sql.contains("urgent"));
        assert_eq!(
            compiled.params,
            vec![
                Value::Text("2026-08-15".to_string()),
                Value::Text("urgent".to_string()),
            ]
        );
    }
}
