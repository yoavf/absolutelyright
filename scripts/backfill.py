#!/usr/bin/env python3
import sys
from claude_counter import *


def scan_all_projects():
    compiled_patterns = {
        name: re.compile(pattern, re.IGNORECASE) for name, pattern in PATTERNS.items()
    }
    daily_counts = {name: defaultdict(int) for name in PATTERNS}
    total_counts = {name: 0 for name in PATTERNS}
    project_breakdown = defaultdict(lambda: defaultdict(int))
    total_messages_per_day = defaultdict(int)
    seen_message_ids = set()  # Track processed message IDs to avoid duplicates

    if not os.path.exists(CLAUDE_PROJECTS_BASE):
        print(f"Error: Projects directory not found at {CLAUDE_PROJECTS_BASE}")
        print("Set CLAUDE_PROJECTS env variable to your Claude projects path")
        return daily_counts, project_breakdown, total_messages_per_day

    print("Scanning all Claude projects...")

    for project_dir in Path(CLAUDE_PROJECTS_BASE).iterdir():
        if project_dir.is_dir() and not project_dir.name.startswith("."):
            project_name = get_project_display_name(project_dir.name)

            for jsonl_file in project_dir.glob("*.jsonl"):
                try:
                    with open(jsonl_file, "r") as f:
                        for line in f:
                            try:
                                entry = json.loads(line)
                                result = process_message_entry(entry, compiled_patterns)

                                if not result:
                                    continue

                                msg_id = result["msg_id"]

                                # Skip if we've already processed this message
                                if msg_id in seen_message_ids:
                                    continue

                                seen_message_ids.add(msg_id)
                                date_str = result["date_str"]

                                # Count total assistant messages
                                total_messages_per_day[date_str] += 1

                                # Count pattern matches (once per message, not per text block)
                                message_patterns = set()
                                for text, matched_patterns in result["text_blocks"]:
                                    message_patterns.update(matched_patterns.keys())

                                for pattern_name in message_patterns:
                                    daily_counts[pattern_name][date_str] += 1
                                    total_counts[pattern_name] += 1
                                    if pattern_name == "absolutely":
                                        project_breakdown[date_str][project_name] += 1

                            except:
                                continue
                except:
                    pass

    for name, count in total_counts.items():
        unique_days = len(daily_counts[name])
        print(f"Found {count} '{name}' across {unique_days} days")

    return daily_counts, project_breakdown, total_messages_per_day


def main():
    """Main backfill process"""
    print("Claude Pattern Counter Backfill")
    print("=" * 50)

    # Check for upload parameters
    api_url = None
    secret = None

    for i, arg in enumerate(sys.argv):
        if arg == "--upload" and i + 2 < len(sys.argv):
            api_url = sys.argv[i + 1]
            secret = sys.argv[i + 2]
            break
        elif arg == "--upload" and i + 1 < len(sys.argv):
            api_url = sys.argv[i + 1]
            break

    # Show current settings
    print(f"Projects directory: {CLAUDE_PROJECTS_BASE}")
    print("Tracking patterns:")
    for name, pattern in PATTERNS.items():
        print(f"  {name}: {pattern}")
    if api_url:
        print(f"Will upload to: {api_url}")
    print("-" * 50)

    # Scan all projects
    daily_counts, project_breakdown, total_messages_per_day = scan_all_projects()

    if not any(daily_counts.values()):
        print("No data found.")
        return

    # Get all dates that have any data (pattern matches OR total messages)
    all_dates = set()
    for pattern_counts in daily_counts.values():
        all_dates.update(pattern_counts.keys())
    all_dates.update(total_messages_per_day.keys())
    sorted_dates = sorted(all_dates)

    # Skip the first day (exclude from display and upload)
    if sorted_dates:
        first_day = sorted_dates[0]
        sorted_dates = sorted_dates[1:]
        print(f"\nSkipping first day ({first_day}) from output and upload")

    print("\nDaily counts:")
    print("-" * 80)

    # Output format based on arguments
    if "--json" in sys.argv:
        # JSON output for piping to other tools
        output = {pattern: dict(counts) for pattern, counts in daily_counts.items()}
        output["by_date"] = {
            date: dict(project_breakdown[date])
            for date in sorted_dates
            if date in project_breakdown
        }
        print(json.dumps(output, indent=2))
    else:
        # Human-readable output
        for date in sorted_dates:
            abs_count = daily_counts["absolutely"].get(date, 0)
            right_count = daily_counts["right"].get(date, 0)
            total_msgs = total_messages_per_day.get(date, 0)
            projects = project_breakdown.get(date, {})

            project_info = ""
            if len(projects) == 1:
                project_info = f" (in {list(projects.keys())[0]})"
            elif len(projects) > 1:
                # Find project with highest count
                top_project = max(projects.items(), key=lambda x: x[1])[0]
                other_count = len(projects) - 1
                if other_count == 1:
                    project_info = f" (in {top_project} and 1 other project)"
                else:
                    project_info = (
                        f" (in {top_project} and {other_count} other projects)"
                    )

            print(
                f"{date}: absolutely={abs_count:3d}, right={right_count:3d}, total={total_msgs:3d}{project_info}"
            )

        print("-" * 50)
        print(f"Total 'absolutely right': {sum(daily_counts['absolutely'].values())}")
        print(f"Total 'right': {sum(daily_counts['right'].values())}")

        # Upload to API if requested (only absolutely and right for now)
        if api_url:
            print("\n" + "-" * 50)
            total_to_upload = sum(
                1
                for date in sorted_dates
                if daily_counts["absolutely"].get(date, 0) > 0
                or daily_counts["right"].get(date, 0) > 0
                or total_messages_per_day.get(date, 0) > 0
            )

            print(f"Found {total_to_upload} days with data to upload.")
            confirm = input("Continue with upload? (y/N): ").strip().lower()
            if confirm not in ["y", "yes"]:
                print("Upload cancelled.")
                return

            print("Uploading to API...")
            success = 0
            failed = 0

            for date in sorted_dates:
                abs_count = daily_counts["absolutely"].get(date, 0)
                right_count = daily_counts["right"].get(date, 0)
                total_msgs = total_messages_per_day.get(date, 0)

                if abs_count > 0 or right_count > 0 or total_msgs > 0:
                    upload_text = f"  Uploading {date}: absolutely={abs_count:2d}, right={right_count:2d}, total={total_msgs:3d}..."
                    print(f"{upload_text:<75}", end="")

                    result = upload_to_api(
                        api_url, secret, date, abs_count, right_count, total_msgs
                    )
                    if result == True:
                        print("✓")
                        success += 1
                    elif result == "STOP":
                        print("✗")
                        failed += 1
                        break
                    else:
                        print("✗")
                        failed += 1

            print("-" * 50)
            print(f"Upload complete: {success} successful, {failed} failed")
            if success > 0:
                print(f"View at: {api_url}")


if __name__ == "__main__":
    main()
