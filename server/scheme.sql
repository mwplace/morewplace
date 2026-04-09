CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    oauth_id VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(50) NOT NULL,
    droplets INT DEFAULT 0,
    level INT DEFAULT 1,
    max_charges INT DEFAULT 5,
    last_charge_update TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
