use regex::Regex;

/// High-performance deterministic string normalizer for venue and address matching.
pub struct Normalizer {
    punct_regex: Regex,
    multi_space_regex: Regex,
}

impl Default for Normalizer {
    fn default() -> Self {
        Self::new()
    }
}

impl Normalizer {
    pub fn new() -> Self {
        Self {
            punct_regex: Regex::new(r"[^\p{L}\p{N}\s]").expect("valid punct regex"),
            multi_space_regex: Regex::new(r"\s+").expect("valid space regex"),
        }
    }

    /// Normalizes a restaurant or location name:
    /// - Trim whitespace
    /// - Lowercase
    /// - Strip legal entity suffixes (Ltd, LLC, Inc, GmbH, etc.)
    /// - Strip punctuation
    /// - Collapse multiple spaces
    pub fn normalize_name(&self, input: &str) -> String {
        let trimmed = input.trim();
        let lower = trimmed.to_lowercase();

        // Strip legal suffixes
        let cleaned = lower
            .replace(" ltd.", "")
            .replace(" ltd", "")
            .replace(" llc", "")
            .replace(" inc.", "")
            .replace(" inc", "")
            .replace(" gmbh", "")
            .replace(" s.a.", "")
            .replace(" s.a", "");

        let stripped = self.punct_regex.replace_all(&cleaned, " ");
        let collapsed = self.multi_space_regex.replace_all(&stripped, " ");
        collapsed.trim().to_string()
    }

    /// Normalizes postal code / ZIP (strips spaces and hyphens, uppercase).
    pub fn normalize_postal_code(&self, code: &str) -> String {
        code.chars()
            .filter(|c| c.is_alphanumeric())
            .map(|c| c.to_ascii_uppercase())
            .collect()
    }

    /// Geohash grid cell key for spatial blocking (rounded to precision ~1.1km).
    pub fn geo_blocking_cell(&self, lat: f64, lon: f64) -> String {
        let lat_cell = (lat * 100.0).round() as i32;
        let lon_cell = (lon * 100.0).round() as i32;
        format!("{:05}_{:05}", lat_cell, lon_cell)
    }
}
