//! Écriture JSON minimale (sortie uniquement), sans dépendance.

/// Ajoute `s` à `out` comme chaîne JSON, guillemets compris.
pub fn push_str(out: &mut String, s: &str) {
    out.push('"');
    for c in s.chars() {
        match c {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            c if (c as u32) < 0x20 => out.push_str(&format!("\\u{:04x}", c as u32)),
            c => out.push(c),
        }
    }
    out.push('"');
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn escapes_specials() {
        let mut s = String::new();
        push_str(&mut s, "a\"b\\c\nd\u{1}é");
        assert_eq!(s, "\"a\\\"b\\\\c\\nd\\u0001é\"");
    }
}
