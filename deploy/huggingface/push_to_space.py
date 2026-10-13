"""
deploy/huggingface/push_to_space.py - upload this repo to a Hugging Face Space (free hosting).

A Space with "sdk: docker" builds our Dockerfile and runs it. A Space needs its own README.md with
a settings block at the top (sdk, port...), which would look messy on GitHub. So we upload the
repo WITHOUT its README and put deploy/huggingface/README.md in its place.

huggingface_hub is the official python client. upload_folder() handles big/binary files (like
model.onnx) for us, which a plain `git push` to Hugging Face would refuse.

Two settings are also written into the Space (Settings -> Variables and secrets):
    ALLOWED_ORIGINS  the website that may call the API from a browser (CORS). our frontend lives
                     on GitHub Pages, a different host, so without this the browser blocks it
    LLM_API_KEY      only if the env variable LLM_API_KEY is set (a GitHub secret in the
                     workflow). stored as a Space SECRET, so nobody can read it back

Run it from the repo root (needs a write token in HF_TOKEN):
    python deploy/huggingface/push_to_space.py --space <hf-username>/seanet-studio --allowed-origins https://<github-user>.github.io
"""
import argparse
import os

from huggingface_hub import HfApi

IGNORE = [
    ".git/*", ".github/*", "**/node_modules/*", "**/dist/*", "**/__pycache__/*",
    "**/.pytest_cache/*", ".env", "**/.env", "README.md", "deploy/*", "model_export/*", "docs/*",
]


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--space", required=True, help="<hf-username>/<space-name>")
    p.add_argument("--allowed-origins", default="",
                   help="comma separated, e.g. https://<github-user>.github.io (no path at the end)")
    args = p.parse_args()

    api = HfApi(token=os.environ["HF_TOKEN"])
    # creates the space the first time, does nothing if it already exists.
    # private=False because the whole point is that anyone can open it
    api.create_repo(args.space, repo_type="space", space_sdk="docker", private=False, exist_ok=True)

    # the browser sends the origin in lower case, so we store it the same way
    if args.allowed_origins:
        api.add_space_variable(args.space, "ALLOWED_ORIGINS", args.allowed_origins.lower())
    key = os.environ.get("LLM_API_KEY", "").strip()
    if key:
        api.add_space_secret(args.space, "LLM_API_KEY", key)
    else:
        print("LLM_API_KEY not given - keeping whatever key the Space already has (or the template text)")

    api.upload_folder(repo_id=args.space, repo_type="space", folder_path=".",
                      ignore_patterns=IGNORE, commit_message="deploy from GitHub")
    api.upload_file(repo_id=args.space, repo_type="space",
                    path_or_fileobj="deploy/huggingface/README.md", path_in_repo="README.md",
                    commit_message="space readme")
    print(f"done - the space rebuilds now: https://huggingface.co/spaces/{args.space}")


if __name__ == "__main__":
    main()
