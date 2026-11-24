#include "entity_resolution.hpp"
#include <iostream>
#include <vector>
#include <unordered_set>
#include <iomanip>

using namespace arrival::algorithms;

int main() {
    std::cout << "================================================================" << std::endl;
    std::cout << "   Project Arrival: C++ Entity Resolution Benchmark Suite       " << std::endl;
    std::cout << "================================================================" << std::endl;

    // Create synthetic adjudicated benchmark corpus
    std::vector<EntityRecord> records;
    std::unordered_set<std::string> true_matches;
    std::unordered_set<std::string> hard_negatives;

    // 100 clusters of restaurants, each with 2 variations (200 records)
    // Plus 50 multi-branch chain venues (hard negatives)
    size_t num_clusters = 100;
    records.reserve(num_clusters * 2 + 50);

    for (size_t i = 0; i < num_clusters; ++i) {
        std::string id_a = "cluster-" + std::to_string(i) + "-v1";
        std::string id_b = "cluster-" + std::to_string(i) + "-v2";

        double base_lat = 51.5000 + (static_cast<double>(i) * 0.001);
        double base_lon = -0.1200 + (static_cast<double>(i) * 0.001);

        records.push_back(EntityRecord{
            id_a,
            "feed_osm",
            "Artisan Bakery #" + std::to_string(i),
            "artisan bakery " + std::to_string(i),
            std::to_string(i * 10) + " High Street, London",
            "SW1A 1AA",
            "GB",
            base_lat,
            base_lon
        });

        // Small variation in name, coordinates and address
        records.push_back(EntityRecord{
            id_b,
            "feed_partner",
            "The Artisan Bakery No. " + std::to_string(i) + " Ltd",
            "artisan bakery " + std::to_string(i),
            std::to_string(i * 10) + " High St",
            "SW1A 1AA",
            "GB",
            base_lat + 0.0001, // ~11 meters offset
            base_lon + 0.0001
        });

        true_matches.insert(id_a + "<->" + id_b);
    }

    // Add 50 hard negative chain branches (same brand name, different postal codes & coordinates)
    for (size_t i = 0; i < 50; ++i) {
        std::string id_branch = "chain-branch-" + std::to_string(i);
        records.push_back(EntityRecord{
            id_branch,
            "feed_osm",
            "Pret A Manger",
            "pret a manger",
            std::to_string(100 + i) + " Kings Road, London",
            "SW3 4TZ",
            "GB",
            51.4880 + (static_cast<double>(i) * 0.01), // > 3km apart
            -0.1600 - (static_cast<double>(i) * 0.01)
        });

        // Any pair between chain branches is a hard negative
        if (i > 0) {
            std::string prev_branch = "chain-branch-" + std::to_string(i - 1);
            hard_negatives.insert(id_branch + "<->" + prev_branch);
        }
    }

    std::cout << "Corpus summary:" << std::endl;
    std::cout << "  Total records: " << records.size() << std::endl;
    std::cout << "  True match pairs: " << true_matches.size() << std::endl;
    std::cout << "  Known hard negative pairs: " << hard_negatives.size() << std::endl;

    // Run evaluation
    double auto_merge_threshold = 0.85;
    auto metrics = EntityResolutionEngine::evaluate_pairs(
        records,
        true_matches,
        hard_negatives,
        auto_merge_threshold
    );

    std::cout << "\nBenchmark Results (Auto-merge threshold: " << auto_merge_threshold << "):" << std::endl;
    std::cout << "----------------------------------------------------------------" << std::endl;
    std::cout << "  Total all-pairs space:         " << metrics.total_pairs_evaluated << std::endl;
    std::cout << "  Candidate pairs after blocking: " << metrics.candidate_pairs_blocked << std::endl;
    std::cout << "  Blocking reduction ratio:       " << std::fixed << std::setprecision(4)
              << (metrics.blocking_reduction_ratio * 100.0) << " %" << std::endl;
    std::cout << "  True Positives (TP):           " << metrics.true_positives << std::endl;
    std::cout << "  False Positives (FP):          " << metrics.false_positives << std::endl;
    std::cout << "  False Negatives (FN):          " << metrics.false_negatives << std::endl;
    std::cout << "  True Negatives (TN):           " << metrics.true_negatives << std::endl;
    std::cout << "  Pairwise Precision:            " << std::setprecision(4) << metrics.precision << std::endl;
    std::cout << "  Pairwise Recall:               " << std::setprecision(4) << metrics.recall << std::endl;
    std::cout << "  Pairwise F1 Score:             " << std::setprecision(4) << metrics.f1_score << std::endl;
    std::cout << "  False Merge Rate:              " << std::setprecision(4) << (metrics.false_merge_rate * 100.0) << " %" << std::endl;
    std::cout << "  Execution Time:                " << std::setprecision(2) << metrics.elapsed_milliseconds << " ms" << std::endl;
    std::cout << "  Scoring Throughput:            " << std::setprecision(0) << metrics.pairs_per_second << " pairs/sec" << std::endl;
    std::cout << "================================================================" << std::endl;

    return 0;
}
