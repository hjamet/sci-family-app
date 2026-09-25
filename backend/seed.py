#!/usr/bin/env python3
"""
Seed script CLI for SCI Hellenvilliers database.
Seeds the 7 associates with bcrypt-hashed passcodes from .env,
properties, unified tasks matching Stitch views, comments with reactions, and logs.
"""
import os
import sys

# Ensure backend root is on sys.path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from app.seed import seed_database

if __name__ == "__main__":
    force_reset = "--force" in sys.argv or "-f" in sys.argv
    print(f"Running database seeding (force_reset={force_reset})...")
    seed_database(force=force_reset)
    print("Database seeding completed.")
