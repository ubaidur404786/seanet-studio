"""
deploy/huggingface/push_to_space.py - upload this repo to a Hugging Face Space (free hosting).

A Space with "sdk: docker" builds our Dockerfile and runs it. A Space needs its own README.md with
a settings block at the top (sdk, port...), which would look messy on GitHub. So we upload the
repo WITHOUT its README and put deploy/huggingface/README.md in its place.

huggingface_hub is the official python client. upload_folder() handles big/binary files (like
model.onnx) for us, which a plain `git push` to Hugging Face would refuse.

Run it from the repo root (needs a write token in HF_TOKEN):
    python deploy/huggingface/push_to_space.py --space <hf-username>/seanet-studio
"""
import argparse
import os

from huggingface_hub import HfApi

IGNORE = [
    ".git/*", ".github/*", "**/node_modules/*", "**/dist/*", "**/__pycache__/*",
    "**/.pytest_cache/*", ".env", "**/.env", "README.md", "deploy/*", "model_export/*",
]


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--space", required=True, help="<hf-username>/<space-name>")
    args = p.parse_args()

    api = HfApi(token=os.environ["HF_TOKEN"])
    # creates the space the first time, does nothing if it already exists
    api.create_repo(args.space, repo_type="space", space_sdk="docker", exist_ok=True)
    api.upload_folder(repo_id=args.space, repo_type="space", folder_path=".",
                      ignore_patterns=IGNORE, commit_message="deploy from GitHub")
    api.upload_file(repo_id=args.space, repo_type="space",
                    path_or_fileobj="deploy/huggingface/README.md", path_in_repo="README.md",
                    commit_message="space readme")
    print(f"done - the space rebuilds now: https://huggingface.co/spaces/{args.space}")


if __name__ == "__main__":
    main()
