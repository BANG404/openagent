use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct ThemeColors {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub accent: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub background: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub foreground: Option<String>,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(default)]
pub struct ThemeOverrides {
    pub light: ThemeColors,
    pub dark: ThemeColors,
    /// Paint the theme canvas instead of exposing the desktop's native material.
    pub opaque_background: bool,
    /// Empty follows the selected theme; other values are portable font presets.
    pub font_family: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ui_font_size: Option<u16>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub code_font_size: Option<u16>,
    /// Interaction fill strength from 0 to 100; absent uses the UI's soft default.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub style_contrast: Option<u16>,
}

impl ThemeOverrides {
    pub(super) fn normalize(&mut self) {
        for colors in [&mut self.light, &mut self.dark] {
            for color in [
                &mut colors.accent,
                &mut colors.background,
                &mut colors.foreground,
            ] {
                *color = color.as_ref().and_then(|value| {
                    let value = value.trim();
                    (value.len() == 7
                        && value.starts_with('#')
                        && value.as_bytes()[1..].iter().all(u8::is_ascii_hexdigit))
                    .then(|| value.to_ascii_uppercase())
                });
            }
        }
        if !matches!(
            self.font_family.as_str(),
            "" | "system" | "sans" | "serif" | "mono"
        ) {
            self.font_family.clear();
        }
        self.ui_font_size = self.ui_font_size.map(|size| size.clamp(10, 24));
        self.code_font_size = self.code_font_size.map(|size| size.clamp(10, 24));
        self.style_contrast = self.style_contrast.map(|value| value.min(100));
    }
}

#[cfg(test)]
mod tests {
    use crate::config::{normalize_config, Config};

    #[test]
    fn appearance_is_additive_normalized_and_round_trips() {
        let legacy: Config = toml::from_str("config_version = 1\ntheme = 'dark'\n").unwrap();
        assert!(legacy.theme_plugin.is_empty());
        assert_eq!(legacy.theme_overrides, Default::default());
        assert!(!legacy.theme_overrides.opaque_background);
        assert_eq!(legacy.theme_overrides.style_contrast, None);
        let mut config: Config = toml::from_str(
            "config_version = 1\ntheme_plugin = 'my-theme'\n[theme_overrides]\nfont_family = 'serif'\nui_font_size = 99\ncode_font_size = 1\n[theme_overrides.light]\naccent = ' #aabbcc '\nbackground = 'url(secret)'\n[theme_overrides.dark]\nforeground = '#EEEEEE'\n",
        ).unwrap();
        normalize_config(&mut config);
        config.theme_overrides.opaque_background = true;
        config.theme_overrides.style_contrast = Some(200);
        normalize_config(&mut config);
        assert_eq!(config.theme_overrides.style_contrast, Some(100));
        assert_eq!(config.theme_plugin, "my-theme");
        assert_eq!(
            config.theme_overrides.light.accent.as_deref(),
            Some("#AABBCC")
        );
        assert!(config.theme_overrides.light.background.is_none());
        assert_eq!(config.theme_overrides.ui_font_size, Some(24));
        assert_eq!(config.theme_overrides.code_font_size, Some(10));
        let restored: Config = toml::from_str(&toml::to_string(&config).unwrap()).unwrap();
        assert_eq!(restored.theme_overrides, config.theme_overrides);
        config.theme_plugin = "../escape".into();
        config.theme_overrides.font_family = "url(secret)".into();
        normalize_config(&mut config);
        assert!(config.theme_plugin.is_empty());
        assert!(config.theme_overrides.font_family.is_empty());
        assert!(toml::from_str::<Config>("[theme_overrides]\nui_font_size = 'bad'\n").is_err());
        assert!(toml::from_str::<Config>("[theme_overrides]\nstyle_contrast = 'bad'\n").is_err());
        assert!(toml::from_str::<Config>("[theme_overrides]\nstyle_contrast = -1\n").is_err());
        config.theme_overrides.style_contrast = Some(0);
        normalize_config(&mut config);
        let restored: Config = toml::from_str(&toml::to_string(&config).unwrap()).unwrap();
        assert_eq!(restored.theme_overrides.style_contrast, Some(0));
        assert!(
            toml::from_str::<Config>("[theme_overrides]\nopaque_background = 'bad'\n").is_err()
        );
    }
}
