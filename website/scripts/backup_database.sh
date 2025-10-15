#!/bin/bash
BACKUP_DIR="~/project/Projekter/kamiyo/backups"
DB_PATH="~/project/Projekter/kamiyo/data/kamiyo.db"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"
sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/kamiyo_$TIMESTAMP.db'"
gzip "$BACKUP_DIR/kamiyo_$TIMESTAMP.db"
find "$BACKUP_DIR" -name "*.db.gz" -mtime +30 -delete
