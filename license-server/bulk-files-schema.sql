-- Bulk Files Database Schema
-- This table stores bulk file metadata (replaces manifest.json)

CREATE TABLE IF NOT EXISTS bulkFiles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    filename VARCHAR(255) UNIQUE NOT NULL COMMENT 'Actual filename (e.g., "recommended-sires-2025-01-15.json")',
    name VARCHAR(255) NOT NULL COMMENT 'Human-readable name',
    url VARCHAR(500) NOT NULL COMMENT 'Full HTTPS URL to the bulk file',
    size BIGINT DEFAULT 0 COMMENT 'File size in bytes',
    animalCount INT DEFAULT 0 COMMENT 'Number of animals in the file',
    category VARCHAR(255) DEFAULT NULL COMMENT 'Suggested category name for the animals',
    description TEXT DEFAULT NULL COMMENT 'Description of what this bulk file contains',
    isActive TINYINT(1) DEFAULT 1 COMMENT 'Whether this file is active and should be shown',
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP COMMENT 'When this record was created',
    updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'When this record was last updated',
    INDEX idx_filename (filename),
    INDEX idx_isActive (isActive),
    INDEX idx_updatedAt (updatedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Sample data (optional - remove if not needed)
-- INSERT INTO bulkFiles (filename, name, url, size, animalCount, category, description) VALUES
-- ('category-recommended-sires-2025-01-15.json', 'Category Recommended Sires', 'https://scoring.westernsports.video/angus/bulk-files/category-recommended-sires-2025-01-15.json', 1148389, 52, 'Recommended Sires', 'Bulk file: category-recommended-sires'),
-- ('part-2-2025-01-15.json', 'Part 2', 'https://scoring.westernsports.video/angus/bulk-files/part-2-2025-01-15.json', 5240081, 1841, 'Big List', 'Imported from external data file');

