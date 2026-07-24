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
        Expected columns: SIMKL_ID, Title, Type, Year, Watchlist, LastEpWatched, WatchedDate, Rating, My Rating, Memo, TVDB, TMDB, IMDB
        """
        results = []
        with open(self.file_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                item = {
                    "source": "simkl",
                    "id": row.get("SIMKL_ID") or row.get("Simkl ID") or row.get("SIMKL"),
                    "title": row.get("Title"),
                    "type": row.get("Type"),
                    "year": row.get("Year"),
                    "status": row.get("Watchlist") or row.get("Status"),
                    "last_ep_watched": row.get("LastEpWatched") or row.get("Watched Episodes"),
                    "watched_date": row.get("WatchedDate") or row.get("Watched Date") or row.get("Date"),
                    "rating": row.get("Rating") or row.get("My Rating") or row.get("Score"),
                    "tvdb_id": row.get("TVDB") or row.get("TVDB ID"),
                    "tmdb_id": row.get("TMDB") or row.get("TMDB ID"),
                    "imdb_id": row.get("IMDB") or row.get("IMDB ID")
                }
                results.append(item)
        return results

    def parse_trakt(self) -> List[Dict]:
        """
        Parses Trakt CSV exports (watched_shows.csv, watched_movies.csv, ratings.csv, history.csv).
        """
        results = []
        with open(self.file_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                item = {
                    "source": "trakt",
                    "title": row.get("title") or row.get("show_title") or row.get("Title"),
                    "year": row.get("year") or row.get("show_year") or row.get("Year"),
                    "type": "show" if ("season" in row or "episode" in row or "show_title" in row) else "movie",
                    "season": row.get("season"),
                    "episode": row.get("episode") or row.get("number"),
                    "rating": row.get("rating") or row.get("user_rating"),
                    "watched_at": row.get("watched_at") or row.get("last_watched_at") or row.get("rated_at"),
                    "plays": row.get("plays", 1),
                    "imdb_id": row.get("imdb_id") or row.get("IMDB ID"),
                    "tmdb_id": row.get("tmdb_id") or row.get("TMDB ID"),
                    "tvdb_id": row.get("tvdb_id") or row.get("TVDB ID"),
                    "trakt_id": row.get("trakt_id") or row.get("Trakt ID")
                }
                results.append(item)
        return results
