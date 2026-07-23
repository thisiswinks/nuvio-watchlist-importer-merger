import unittest
import os
import json
from extractors.csv_parser import CSVParser
from application.use_cases.batch_merge import BatchMergeUseCase

class TestMergerPipeline(unittest.TestCase):
    def test_simkl_csv_parser(self):
        # Create dummy csv
        with open("test.csv", "w", encoding="utf-8") as f:
            f.write("SIMKL_ID,Title,Type,Year,Watchlist,LastEpWatched,WatchedDate,Rating,Memo,TVDB,TMDB,IMDB\n")
            f.write("1029,Star Trek: The Next Generation,tv show,1987,completed,7,18-12-2023 21:50:41,10,cool,71470,,tt0092455\n")
            
        parser = CSVParser("test.csv")
        results = parser.parse_simkl()
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["id"], "1029")
        self.assertEqual(results[0]["tvdb_id"], "71470")
        self.assertEqual(results[0]["imdb_id"], "tt0092455")
        os.remove("test.csv")
        
    def test_batch_merge_use_case(self):
        with open("test.csv", "w", encoding="utf-8") as f:
            f.write("SIMKL_ID,Title,Type,Year,Watchlist,LastEpWatched,WatchedDate,Rating,Memo,TVDB,TMDB,IMDB\n")
            f.write("1029,Star Trek: The Next Generation,tv show,1987,completed,7,18-12-2023 21:50:41,10,cool,71470,,tt0092455\n")
            
        class MockMapper:
            def lookup(self, ids, title):
                return None
                
        use_case = BatchMergeUseCase(MockMapper())
        count = use_case.execute("test.csv", "test_output.json")
        self.assertEqual(count, 1)
        
        with open("test_output.json", "r") as f:
            data = json.load(f)
            self.assertEqual(data[0]["title"], "Star Trek: The Next Generation")
            self.assertEqual(data[0]["ids"]["simkl"], "1029")
            
        os.remove("test.csv")
        os.remove("test_output.json")

if __name__ == "__main__":
    unittest.main()
