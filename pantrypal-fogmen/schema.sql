-- PantryPal x Fogmen — schema
-- Run this against your MySQL-compatible database (TiDB Cloud, Aiven, local MySQL, etc.)
-- before the site's first sign-up.
--
-- IMPORTANT if you're using TiDB Cloud's SQL Editor / Chat2Query: run each
-- CREATE TABLE statement below ONE AT A TIME (select just one block, run it,
-- then move to the next) rather than pasting the whole file at once. Some
-- serverless SQL consoles mis-handle multi-statement pastes with comments.
--
-- Note: relationships between tables (e.g. saved_recipes.user_id -> users.id)
-- are enforced at the application level rather than with FOREIGN KEY
-- constraints, since constraint support varies across managed MySQL-compatible
-- providers. Plain indexes are used instead to keep lookups fast.

CREATE TABLE users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(120) NOT NULL,
  email         VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE saved_recipes (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  user_id           INT NOT NULL,
  recipe_id         INT NOT NULL,
  title             VARCHAR(255) NOT NULL,
  image             VARCHAR(500),
  ready_in_minutes  INT,
  servings          INT,
  ingredient_count  INT,
  saved_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_user_recipe (user_id, recipe_id),
  KEY idx_saved_user (user_id)
);

CREATE TABLE search_history (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id      INT NOT NULL,
  ingredients  VARCHAR(500) NOT NULL,
  searched_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_hist_user (user_id)
);

CREATE TABLE donations (
  id           INT AUTO_INCREMENT PRIMARY KEY,
  user_id      INT NOT NULL,
  amount       INT NOT NULL,
  donated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  KEY idx_don_user (user_id)
);
