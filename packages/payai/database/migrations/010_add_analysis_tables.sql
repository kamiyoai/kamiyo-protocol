-- Migration 010: Add Analysis Tables for Fork Detection and Pattern Recognition
-- Created: 2025-10-10
-- Purpose: Store analysis results for exploit deep analysis features

-- Exploit analysis results (cached analysis)
CREATE TABLE IF NOT EXISTS exploit_analysis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exploit_id INTEGER NOT NULL,
    analysis_type TEXT NOT NULL,  -- 'bytecode_analysis', 'pattern_cluster', 'fork_detection'
    results TEXT NOT NULL,  -- JSON blob of analysis results
    analyzed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (exploit_id) REFERENCES exploits(id) ON DELETE CASCADE,
    UNIQUE(exploit_id, analysis_type)
);

-- Fork relationships (for quick lookup)
CREATE TABLE IF NOT EXISTS fork_relationships (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exploit_id_1 INTEGER NOT NULL,
    exploit_id_2 INTEGER NOT NULL,
    similarity_score REAL NOT NULL,
    relationship_type TEXT NOT NULL,  -- 'exact_fork', 'likely_fork', 'similar'
    detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (exploit_id_1) REFERENCES exploits(id) ON DELETE CASCADE,
    FOREIGN KEY (exploit_id_2) REFERENCES exploits(id) ON DELETE CASCADE,
    UNIQUE(exploit_id_1, exploit_id_2)
);

-- Pattern clusters (for grouping exploits)
CREATE TABLE IF NOT EXISTS pattern_clusters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cluster_name TEXT,
    characteristics TEXT,  -- JSON blob of cluster characteristics
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Cluster membership (many-to-many)
CREATE TABLE IF NOT EXISTS cluster_membership (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    exploit_id INTEGER NOT NULL,
    cluster_id INTEGER NOT NULL,
    distance_from_center REAL,
    added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (exploit_id) REFERENCES exploits(id) ON DELETE CASCADE,
    FOREIGN KEY (cluster_id) REFERENCES pattern_clusters(id) ON DELETE CASCADE,
    UNIQUE(exploit_id, cluster_id)
);

-- Performance indexes for analysis tables
CREATE INDEX IF NOT EXISTS idx_analysis_exploit ON exploit_analysis(exploit_id);
CREATE INDEX IF NOT EXISTS idx_analysis_type ON exploit_analysis(analysis_type);
CREATE INDEX IF NOT EXISTS idx_analysis_date ON exploit_analysis(analyzed_at);

CREATE INDEX IF NOT EXISTS idx_fork_exploit1 ON fork_relationships(exploit_id_1);
CREATE INDEX IF NOT EXISTS idx_fork_exploit2 ON fork_relationships(exploit_id_2);
CREATE INDEX IF NOT EXISTS idx_fork_similarity ON fork_relationships(similarity_score DESC);

CREATE INDEX IF NOT EXISTS idx_membership_exploit ON cluster_membership(exploit_id);
CREATE INDEX IF NOT EXISTS idx_membership_cluster ON cluster_membership(cluster_id);

-- View for fork families (connected components)
CREATE VIEW IF NOT EXISTS v_fork_families AS
WITH RECURSIVE fork_family(exploit_id, family_root) AS (
    -- Base case: each exploit is its own family
    SELECT DISTINCT exploit_id_1 as exploit_id, exploit_id_1 as family_root
    FROM fork_relationships
    WHERE similarity_score >= 0.8

    UNION

    -- Recursive case: follow fork relationships
    SELECT f.exploit_id_2, ff.family_root
    FROM fork_relationships f
    JOIN fork_family ff ON f.exploit_id_1 = ff.exploit_id
    WHERE f.similarity_score >= 0.8
)
SELECT
    family_root,
    COUNT(DISTINCT exploit_id) as family_size,
    GROUP_CONCAT(DISTINCT exploit_id) as member_ids
FROM fork_family
GROUP BY family_root;

-- View for cluster statistics
CREATE VIEW IF NOT EXISTS v_cluster_stats AS
SELECT
    c.id as cluster_id,
    c.cluster_name,
    COUNT(m.exploit_id) as member_count,
    AVG(m.distance_from_center) as avg_distance,
    MIN(m.added_at) as first_member_added,
    MAX(m.added_at) as last_member_added
FROM pattern_clusters c
LEFT JOIN cluster_membership m ON c.id = m.cluster_id
GROUP BY c.id;
