#include "entity_resolution.hpp"
#include <vector>
#include <string>
#include <algorithm>
#include <cmath>
#include <chrono>

namespace arrival::algorithms {

static const double PI = 3.14159265358979323846;
static const double EARTH_RADIUS_METERS = 6371000.0;

double EntityResolutionEngine::haversine_distance_meters(double lat1, double lon1, double lat2, double lon2) {
    double dLat = (lat2 - lat1) * PI / 180.0;
    double dLon = (lon2 - lon1) * PI / 180.0;

    double rLat1 = lat1 * PI / 180.0;
    double rLat2 = lat2 * PI / 180.0;

    double a = std::sin(dLat / 2.0) * std::sin(dLat / 2.0) +
               std::cos(rLat1) * std::cos(rLat2) *
               std::sin(dLon / 2.0) * std::sin(dLon / 2.0);
    double c = 2.0 * std::atan2(std::sqrt(a), std::sqrt(1.0 - a));
    return EARTH_RADIUS_METERS * c;
}

double EntityResolutionEngine::jaro_winkler_similarity(const std::string& s1, const std::string& s2) {
    if (s1.empty() && s2.empty()) return 1.0;
    if (s1.empty() || s2.empty()) return 0.0;
    if (s1 == s2) return 1.0;

    int len1 = static_cast<int>(s1.length());
    int len2 = static_cast<int>(s2.length());

    int match_distance = std::max(len1, len2) / 2 - 1;
    if (match_distance < 0) match_distance = 0;

    std::vector<bool> s1_matches(len1, false);
    std::vector<bool> s2_matches(len2, false);

    int matches = 0;
    for (int i = 0; i < len1; ++i) {
        int start = std::max(0, i - match_distance);
        int end = std::min(i + match_distance + 1, len2);
        for (int j = start; j < end; ++j) {
            if (s2_matches[j]) continue;
            if (s1[i] != s2[j]) continue;
            s1_matches[i] = true;
            s2_matches[j] = true;
            matches++;
            break;
        }
    }

    if (matches == 0) return 0.0;

    double transpositions = 0.0;
    int k = 0;
    for (int i = 0; i < len1; ++i) {
        if (!s1_matches[i]) continue;
        while (!s2_matches[k]) k++;
        if (s1[i] != s2[k]) transpositions += 0.5;
        k++;
    }

    double m = static_cast<double>(matches);
    double jaro = (m / len1 + m / len2 + (m - transpositions) / m) / 3.0;

    // Winkler prefix adjustment
    int prefix = 0;
    int max_prefix = std::min(4, std::min(len1, len2));
    for (int i = 0; i < max_prefix; ++i) {
        if (s1[i] == s2[i]) prefix++;
        else break;
    }

    double p = 0.1; // standard scaling factor
    return jaro + prefix * p * (1.0 - jaro);
}

int EntityResolutionEngine::levenshtein_distance(const std::string& s1, const std::string& s2) {
    int m = static_cast<int>(s1.size());
    int n = static_cast<int>(s2.size());
    std::vector<int> prev(n + 1), curr(n + 1);

    for (int j = 0; j <= n; ++j) prev[j] = j;

    for (int i = 1; i <= m; ++i) {
        curr[0] = i;
        for (int j = 1; j <= n; ++j) {
            int cost = (s1[i - 1] == s2[j - 1]) ? 0 : 1;
            curr[j] = std::min({curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost});
        }
        prev = curr;
    }

    return prev[n];
}

static std::vector<std::string> split_tokens(const std::string& s) {
    std::vector<std::string> tokens;
    std::string token;
    for (char c : s) {
        if (c == ' ' || c == '\t' || c == '\n' || c == ',') {
            if (!token.empty()) {
                tokens.push_back(token);
                token.clear();
            }
        } else {
            token += static_cast<char>(std::tolower(static_cast<unsigned char>(c)));
        }
    }
    if (!token.empty()) tokens.push_back(token);
    return tokens;
}

double EntityResolutionEngine::token_jaccard_similarity(const std::string& s1, const std::string& s2) {
    auto t1 = split_tokens(s1);
    auto t2 = split_tokens(s2);
    if (t1.empty() && t2.empty()) return 1.0;
    if (t1.empty() || t2.empty()) return 0.0;

    std::unordered_set<std::string> set1(t1.begin(), t1.end());
    std::unordered_set<std::string> set2(t2.begin(), t2.end());

    size_t intersection_size = 0;
    for (const auto& item : set1) {
        if (set2.find(item) != set2.end()) {
            intersection_size++;
        }
    }

    size_t union_size = set1.size() + set2.size() - intersection_size;
    if (union_size == 0) return 1.0;
    return static_cast<double>(intersection_size) / static_cast<double>(union_size);
}

PairScoreResult EntityResolutionEngine::score_pair(const EntityRecord& a, const EntityRecord& b) {
    // Distance
    double dist_m = haversine_distance_meters(a.latitude, a.longitude, b.latitude, b.longitude);

    // Geographic proximity score with steep exponential decay beyond 500m
    double geo_prox = 0.0;
    if (dist_m <= 50.0) {
        geo_prox = 1.0;
    } else if (dist_m <= 250.0) {
        geo_prox = 0.85;
    } else if (dist_m <= 1000.0) {
        geo_prox = 0.50;
    } else if (dist_m <= 5000.0) {
        geo_prox = 0.10;
    } else {
        geo_prox = 0.0;
    }

    // Name similarity: combination of Jaro-Winkler and Token Jaccard
    double jw_name = jaro_winkler_similarity(a.normalized_name, b.normalized_name);
    double jaccard_name = token_jaccard_similarity(a.normalized_name, b.normalized_name);
    double name_score = 0.6 * jw_name + 0.4 * jaccard_name;

    // Address similarity: combine token jaccard with postal code agreement
    double addr_score = token_jaccard_similarity(a.address, b.address);
    if (!a.postal_code.empty() && a.postal_code == b.postal_code) {
        addr_score = std::max(addr_score, 0.85);
    }

    // Hard negative detection:
    // If geographic distance > 1500 meters, these are physically distinct locations
    // (such as different branches of the same brand, or distinct venues), never the same restaurant location.
    bool is_hard_negative = false;
    if (dist_m > 1500.0) {
        is_hard_negative = true;
    }

    // Country mismatch is an absolute block
    if (a.country_code != b.country_code) {
        is_hard_negative = true;
    }

    // Weighted composite score (Fellegi-Sunter model weights)
    double composite = 0.0;
    if (!is_hard_negative) {
        composite = 0.55 * name_score + 0.25 * geo_prox + 0.20 * addr_score;
    }

    return PairScoreResult{
        a.id,
        b.id,
        name_score,
        addr_score,
        geo_prox,
        composite,
        dist_m,
        is_hard_negative,
    };
}

static void emit_pairs_with_subblocking(
    const std::vector<size_t>& indices,
    const std::vector<EntityRecord>& records,
    std::unordered_set<uint64_t>& candidate_pairs,
    bool subblock_by_name
) {
    if (indices.size() <= 1) return;

    auto add_pair = [&](size_t i, size_t j) {
        size_t idx1 = std::min(i, j);
        size_t idx2 = std::max(i, j);
        uint64_t key = (static_cast<uint64_t>(idx1) << 32) | static_cast<uint64_t>(idx2);
        candidate_pairs.insert(key);
    };

    if (indices.size() < 100) {
        for (size_t a = 0; a < indices.size(); ++a) {
            for (size_t b = a + 1; b < indices.size(); ++b) {
                add_pair(indices[a], indices[b]);
            }
        }
    } else {
        // Sub-block large blocks to preserve recall without quadratic explosion
        std::unordered_map<std::string, std::vector<size_t>> sub_blocks;
        for (size_t idx : indices) {
            const auto& r = records[idx];
            std::string sub_key;
            if (subblock_by_name) {
                sub_key = (r.normalized_name.length() >= 2) ? r.normalized_name.substr(0, 2) : "__";
            } else {
                int lat_c = static_cast<int>(std::round(r.latitude * 100.0));
                int lon_c = static_cast<int>(std::round(r.longitude * 100.0));
                sub_key = std::to_string(lat_c) + "_" + std::to_string(lon_c);
            }
            sub_blocks[sub_key].push_back(idx);
        }

        for (const auto& [_, sub_list] : sub_blocks) {
            if (sub_list.size() > 1) {
                for (size_t a = 0; a < sub_list.size(); ++a) {
                    for (size_t b = a + 1; b < sub_list.size(); ++b) {
                        add_pair(sub_list[a], sub_list[b]);
                    }
                }
            }
        }
    }
}

std::vector<std::pair<size_t, size_t>> EntityResolutionEngine::generate_blocked_pairs(
    const std::vector<EntityRecord>& records
) {
    std::unordered_map<std::string, std::vector<size_t>> spatial_blocks;
    std::unordered_map<std::string, std::vector<size_t>> name_blocks;

    for (size_t i = 0; i < records.size(); ++i) {
        const auto& r = records[i];

        // Spatial cell (~1.1km grid)
        int lat_cell = static_cast<int>(std::round(r.latitude * 100.0));
        int lon_cell = static_cast<int>(std::round(r.longitude * 100.0));
        std::string geo_key = r.country_code + "_" + std::to_string(lat_cell) + "_" + std::to_string(lon_cell);
        spatial_blocks[geo_key].push_back(i);

        // Name prefix block (first 4 chars of normalized name)
        if (r.normalized_name.length() >= 4) {
            std::string name_key = r.country_code + "_" + r.normalized_name.substr(0, 4);
            name_blocks[name_key].push_back(i);
        }
    }

    std::unordered_set<uint64_t> candidate_pairs;

    auto add_pair = [&](size_t i, size_t j) {
        size_t idx1 = std::min(i, j);
        size_t idx2 = std::max(i, j);
        uint64_t key = (static_cast<uint64_t>(idx1) << 32) | static_cast<uint64_t>(idx2);
        candidate_pairs.insert(key);
    };

    // 1. Spatial blocking with Moore neighborhood (forward neighbor cells)
    const std::vector<std::pair<int, int>> forward_neighbors = {
        {0, 1},
        {1, -1},
        {1, 0},
        {1, 1}
    };

    for (const auto& [geo_key, indices] : spatial_blocks) {
        // Intra-cell pairs
        emit_pairs_with_subblocking(indices, records, candidate_pairs, true);

        // Cross-cell pairs with forward neighbor cells for boundary recall
        size_t first_us = geo_key.find('_');
        size_t second_us = geo_key.find('_', first_us + 1);
        if (first_us == std::string::npos || second_us == std::string::npos) continue;

        std::string country_code = geo_key.substr(0, first_us);
        int lat_cell = std::stoi(geo_key.substr(first_us + 1, second_us - first_us - 1));
        int lon_cell = std::stoi(geo_key.substr(second_us + 1));

        for (const auto& [d_lat, d_lon] : forward_neighbors) {
            std::string neighbor_key = country_code + "_" +
                                      std::to_string(lat_cell + d_lat) + "_" +
                                      std::to_string(lon_cell + d_lon);

            auto it = spatial_blocks.find(neighbor_key);
            if (it == spatial_blocks.end() || it->second.empty()) continue;

            const auto& neighbor_indices = it->second;
            bool both_small = (indices.size() < 100 && neighbor_indices.size() < 100);

            if (both_small) {
                for (size_t i : indices) {
                    for (size_t j : neighbor_indices) {
                        add_pair(i, j);
                    }
                }
            } else {
                // Secondary attribute sub-block across large adjacent blocks
                std::unordered_map<std::string, std::vector<size_t>> neighbor_sub;
                for (size_t j : neighbor_indices) {
                    const auto& rB = records[j];
                    std::string pfx = (rB.normalized_name.length() >= 2) ? rB.normalized_name.substr(0, 2) : "__";
                    neighbor_sub[pfx].push_back(j);
                }

                for (size_t i : indices) {
                    const auto& rA = records[i];
                    std::string pfx = (rA.normalized_name.length() >= 2) ? rA.normalized_name.substr(0, 2) : "__";
                    auto sub_it = neighbor_sub.find(pfx);
                    if (sub_it != neighbor_sub.end()) {
                        for (size_t j : sub_it->second) {
                            add_pair(i, j);
                        }
                    }
                }
            }
        }
    }

    // 2. Name prefix blocking
    for (const auto& [_, indices] : name_blocks) {
        emit_pairs_with_subblocking(indices, records, candidate_pairs, false);
    }

    std::vector<std::pair<size_t, size_t>> result;
    result.reserve(candidate_pairs.size());
    for (uint64_t p : candidate_pairs) {
        size_t a = static_cast<size_t>(p >> 32);
        size_t b = static_cast<size_t>(p & 0xFFFFFFFF);
        result.emplace_back(a, b);
    }

    return result;
}

BenchmarkMetrics EntityResolutionEngine::evaluate_pairs(
    const std::vector<EntityRecord>& records,
    const std::unordered_set<std::string>& ground_truth_matches,
    const std::unordered_set<std::string>& /*known_hard_negatives*/,
    double auto_merge_threshold
) {
    auto start = std::chrono::high_resolution_clock::now();

    size_t n = records.size();
    size_t total_possible_pairs = (n * (n - 1)) / 2;

    auto candidate_pairs = generate_blocked_pairs(records);
    size_t blocked_candidates = candidate_pairs.size();

    // Canonicalize ground truth matches into min_id <-> max_id format
    std::unordered_set<std::string> canonical_truth;
    for (const auto& pair_str : ground_truth_matches) {
        size_t delim = pair_str.find("<->");
        if (delim != std::string::npos) {
            std::string id_a = pair_str.substr(0, delim);
            std::string id_b = pair_str.substr(delim + 3);
            std::string canonical = (id_a < id_b) ? (id_a + "<->" + id_b) : (id_b + "<->" + id_a);
            canonical_truth.insert(canonical);
        }
    }

    std::unordered_set<std::string> predicted_matches;

    for (const auto& [i, j] : candidate_pairs) {
        const auto& a = records[i];
        const auto& b = records[j];

        auto score_result = score_pair(a, b);
        bool predicted = (score_result.composite_score >= auto_merge_threshold && !score_result.is_hard_negative);

        if (predicted) {
            std::string canonical = (a.id < b.id) ? (a.id + "<->" + b.id) : (b.id + "<->" + a.id);
            predicted_matches.insert(canonical);
        }
    }

    size_t tp = 0;
    size_t fn = 0;
    for (const auto& true_pair : canonical_truth) {
        if (predicted_matches.find(true_pair) != predicted_matches.end()) {
            tp++;
        } else {
            fn++;
        }
    }

    size_t fp = 0;
    for (const auto& pred_pair : predicted_matches) {
        if (canonical_truth.find(pred_pair) == canonical_truth.end()) {
            fp++;
        }
    }

    size_t total_non_matches = (total_possible_pairs > canonical_truth.size()) ?
                               (total_possible_pairs - canonical_truth.size()) : 0;
    size_t tn = (total_non_matches > fp) ? (total_non_matches - fp) : 0;

    auto end = std::chrono::high_resolution_clock::now();
    double elapsed_ms = std::chrono::duration<double, std::milli>(end - start).count();

    double precision = (tp + fp) > 0 ? static_cast<double>(tp) / (tp + fp) : 1.0;
    double recall = (tp + fn) > 0 ? static_cast<double>(tp) / (tp + fn) : 1.0;
    double f1 = (precision + recall) > 0 ? 2.0 * (precision * recall) / (precision + recall) : 0.0;
    double false_merge_rate = total_non_matches > 0 ? static_cast<double>(fp) / total_non_matches : 0.0;
    double reduction_ratio = total_possible_pairs > 0 ? 1.0 - (static_cast<double>(blocked_candidates) / total_possible_pairs) : 1.0;
    double throughput = (elapsed_ms > 0.0) ? (blocked_candidates / (elapsed_ms / 1000.0)) : 0.0;

    return BenchmarkMetrics{
        total_possible_pairs,
        blocked_candidates,
        tp,
        fp,
        fn,
        tn,
        precision,
        recall,
        f1,
        false_merge_rate,
        reduction_ratio,
        elapsed_ms,
        throughput,
    };
}

} // namespace arrival::algorithms
