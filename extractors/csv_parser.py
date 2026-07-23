import csv
import os
from typing import List, Dict

class CSVParser:
    """Parses exported CSV watchlists into a standardized intermediate format."""
    
    def __init__(self, file_path: str):
        if not os.path.exists(file_path):
            raise FileNotFoundError(f"CSV file not found: {file_path}")
        self.file_path = file_path

    def parse_simkl(self) -> List[Dict]:
        """
        Parses a SimklBackup.csv.
        Expected columns: SIMKL_ID, Title, Type, Year, Watchlist, LastEpWatched, WatchedDate, Rating, Memo, TVDB, TMDB, IMDB
        """
        results = []
        with open(self.file_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                # Standardize to intermediate format
                item = {
                    "source": "simkl",
                    "id": row.get("SIMKL_ID"),
                    "title": row.get("Title"),
                    "type": row.get("Type"),
                    "year": row.get("Year"),
                    "status": row.get("Watchlist"),
                    "last_ep_watched": row.get("LastEpWatched"),
                    "watched_date": row.get("WatchedDate"),
                    "rating": row.get("Rating"),
                    "tvdb_id": row.get("TVDB"),
                    "tmdb_id": row.get("TMDB"),
                    "imdb_id": row.get("IMDB")
                }
                results.append(item)
        return results
