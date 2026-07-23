# nuvio-watchlist-importer-merger

A CLI tool that parses offline CSV watchlist exports (like Simkl backups) and merges them into the Nuvio canonical state format.

This repository acts as the offline companion to the live sync engine (Nuvio-What-I-Watched-Bridge). It maps external IDs using the Otaku Enrichment models and generates a seed `state.json` file.

## Usage

1. Place your `SimklBackup.csv` in your working directory.
2. Run the batch merge script:
   ```bash
   python3 run_merger.py /path/to/SimklBackup.csv /path/to/output_state.json
   ```

## Architecture

This strictly follows Domain-Driven Design (DDD):
- `domain/`: Shared domain models (`CanonicalMediaItem`, `CanonicalIDs`).
- `extractors/`: Specific parsers (`csv_parser.py`) for raw export formats.
- `application/`: Orchestration layer (`batch_merge.py`) to map raw data to canonical state.

## Contributing

See `AGENTS.md` for our strict guidelines on agent contributions, DDD layer boundaries, and the prohibition of AI slop.
