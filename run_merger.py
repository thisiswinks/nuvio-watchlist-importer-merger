import sys
from application.use_cases.batch_merge import BatchMergeUseCase
from infrastructure.otaku_mappings.mapper_repository import OtakuMapperRepository

def main():
    if len(sys.argv) != 3:
        print("Usage: python3 run_merger.py <input_csv_path> <output_json_path>")
        sys.exit(1)

    input_csv = sys.argv[1]
    output_json = sys.argv[2]

    mapper_repo = OtakuMapperRepository()
    use_case = BatchMergeUseCase(mapper_repo)

    print(f"Parsing {input_csv} and mapping to canonical state...")
    try:
        count = use_case.execute(input_csv, output_json)
        print(f"Success. Merged {count} records into {output_json}.")
    except Exception as e:
        print(f"Error during merge: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
