use arrival_ingestion::{AllowedPurpose, IngestionPipeline, RawSourceRecord, SourceRegistryEntry};
use std::time::Instant;

fn main() {
    println!("--- Project Arrival: High-Throughput Rust Ingestion Engine ---");

    let source = SourceRegistryEntry {
        source_key: "licensed_core_feed".to_string(),
        source_name: "Licensed Commercial Partner Feed".to_string(),
        terms_url: "https://arrival.internal/legal/feed-terms".to_string(),
        license_name: "Commercial-Arrival-2026".to_string(),
        allowed_purposes: vec![
            AllowedPurpose::DiscoverySearch,
            AllowedPurpose::MerchantVerification,
        ],
        max_retention_days: 90,
        active: true,
    };

    let pipeline = IngestionPipeline::new(vec![source]);

    // Benchmark 50,000 synthetic records normalization
    let count = 50_000;
    println!("Benchmarking ingestion throughput for {} records...", count);

    let start = Instant::now();
    for i in 0..count {
        let record = RawSourceRecord {
            source_key: "licensed_core_feed".to_string(),
            external_id: format!("ext-venue-{}", i),
            raw_name: format!("  The Westminster Artisan Bakery & Cafe Ltd. #{} ", i),
            country_code: "GB".to_string(),
            address_line: "12 Victoria Street".to_string(),
            postal_code: "SW1H 0EX".to_string(),
            latitude: 51.4988,
            longitude: -0.1309,
            observed_at: None,
        };

        let result = pipeline.process_record(record, AllowedPurpose::DiscoverySearch);
        assert!(result.is_ok());
    }

    let elapsed = start.elapsed();
    let seconds = elapsed.as_secs_f64();
    let records_per_sec = count as f64 / seconds;

    println!("Completed in {:.4}s", seconds);
    println!(
        "Ingestion throughput: {:.0} records/sec ({:.2} µs/record)",
        records_per_sec,
        (seconds * 1_000_000.0) / count as f64
    );
}
