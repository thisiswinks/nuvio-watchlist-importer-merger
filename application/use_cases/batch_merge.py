import json
import os
from dataclasses import asdict
from typing import Dict, List
from extractors.csv_parser import CSVParser
from domain.models.canonical_item import CanonicalMediaItem
from domain.models.canonical_ids import CanonicalIDs
from domain.services.otaku_enrichment import enrich_canonical_item

class BatchMergeUseCase:
    """Orchestrates parsing a CSV watchlist and converting it into a canonical state JSON."""
    
    def __init__(self, otaku_mapper):
        self.otaku_mapper = otaku_mapper

    def execute(self, csv_file_path: str, output_json_path: str):
        """Executes the batch merge."""
        parser = CSVParser(csv_file_path)
        raw_items = parser.parse_simkl()
        
        canonical_items = []
        for raw in raw_items:
            # Map raw fields to canonical IDs
            external_ids = {
                "simkl": raw["id"]
            }
            if raw["tvdb_id"]:
                external_ids["tvdb"] = raw["tvdb_id"]
            if raw["tmdb_id"]:
                external_ids["tmdb"] = raw["tmdb_id"]
            if raw["imdb_id"]:
                external_ids["imdb"] = raw["imdb_id"]

            ids = CanonicalIDs(**external_ids)
            
            # Construct the canonical item
            try:
                year = int(raw.get("year", 0))
            except (ValueError, TypeError):
                year = None
                
            item = CanonicalMediaItem(
                title=raw["title"],
                media_type=raw.get("type", "anime"),
                year=year,
                watched_date=raw.get("watched_date"),
                ids=ids,
                is_anime=(raw.get("type") == "anime" or raw["title"].lower().startswith("anime"))
            )
            
            # Enrich missing IDs if possible
            if raw["type"] == "anime" or raw["title"].lower().startswith("anime"):
                item = enrich_canonical_item(item, self.otaku_mapper)
            
            canonical_items.append(asdict(item))

        # Write to state JSON
        dirname = os.path.dirname(output_json_path)
        if dirname:
            os.makedirs(dirname, exist_ok=True)
        with open(output_json_path, 'w', encoding='utf-8') as f:
            json.dump(canonical_items, f, indent=2)

        return len(canonical_items)
