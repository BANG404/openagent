//! Product-bundled skills. Existing user-maintained instructions always win.
use std::io::Write;
use std::path::Path;

const DEFAULT_SKILLS: [(&str, &str); 2] = [
    (
        "find-skills",
        include_str!("../resources/skills/find-skills/SKILL.md"),
    ),
    (
        "terminal-file-tools",
        include_str!("../resources/skills/terminal-file-tools/SKILL.md"),
    ),
];

pub fn ensure_default_skills_in(root: &Path) -> std::io::Result<()> {
    for (name, content) in DEFAULT_SKILLS {
        let directory = root.join(name);
        std::fs::create_dir_all(&directory)?;
        let destination = directory.join("SKILL.md");
        if destination.exists() {
            continue;
        }
        let mut file = tempfile::NamedTempFile::new_in(&directory)?;
        file.write_all(content.as_bytes())?;
        file.as_file().sync_all()?;
        // A failed write leaves no partial skill. Concurrent customizations win.
        match file.persist_noclobber(destination) {
            Ok(_) => {}
            Err(error) if error.error.kind() == std::io::ErrorKind::AlreadyExists => {}
            Err(error) => return Err(error.error),
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seeds_missing_skills_and_preserves_user_instructions() {
        let root = tempfile::tempdir().unwrap();
        let custom = root.path().join("find-skills/SKILL.md");
        std::fs::create_dir_all(custom.parent().unwrap()).unwrap();
        std::fs::write(&custom, "my skill instructions").unwrap();
        ensure_default_skills_in(root.path()).unwrap();
        ensure_default_skills_in(root.path()).unwrap();
        assert_eq!(
            std::fs::read_to_string(custom).unwrap(),
            "my skill instructions"
        );
        assert_eq!(
            std::fs::read_to_string(root.path().join("terminal-file-tools/SKILL.md")).unwrap(),
            DEFAULT_SKILLS[1].1
        );
    }
}
