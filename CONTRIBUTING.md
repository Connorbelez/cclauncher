# Contributing to CCLauncher

Thank you for your interest in contributing to CCLauncher! We welcome contributions from the community to help improve this tool.

## Prerequisites

- **Bun**: This project uses [Bun](https://bun.sh) as its package manager and runtime. Please ensure you have it installed (v1.0.0+).
- **Git**: Version control.

## Getting Started

1.  **Fork the repository** on GitHub.
2.  **Clone your fork** locally:
    ```bash
    git clone https://github.com/YOUR_USERNAME/cclauncher.git
    cd cclauncher
    ```
3.  **Install dependencies**:
    ```bash
    bun install
    ```

## Development Workflow

To run the TUI in development mode with hot reloading:

```bash
bun dev
```

To build the production CLI:

```bash
bun run build
```

## Testing & Linting

Before submitting a Pull Request, please ensure your code passes all checks:

-   **Linting**:
    ```bash
    bun run lint
    # or to automatically fix issues:
    bun run format
    ```
-   **Type Checking**:
    ```bash
    bun run check
    ```
-   **Tests**:
    ```bash
    bun run test
    ```

## Making Changes

1.  Create a new branch for your feature or fix: `git checkout -b feature/my-new-feature`.
2.  Commit your changes following [Conventional Commits](https://www.conventionalcommits.org/) if possible (e.g., `feat: add new sorting option`, `fix: crash on resize`).
3.  Push your branch to your fork.
4.  Open a Pull Request against the `main` branch.

## Pull Request Process

1.  Ensure your PR has a descriptive title and description.
2.  The CI pipeline will automatically run linting and tests.
3.  A maintainer will review your code.
4.  Once approved, it will be merged.


## For Maintainers: Release Process

Projec releases are automated using [Changesets](https://github.com/changesets/changesets).

### 1. Create a Changeset
When you land a PR that should trigger a release or update in the changelog, create a changeset **before merging**:
```bash
npx changeset
```
Follow the prompts to select the change type (patch/minor/major) and write a summary.

### 2. Versioning
To prepare a new release:
1.  Run `npx changeset version`. This consumes the changelog entries and updates `package.json` and `CHANGELOG.md`.
2.  Commit the changes:
    ```bash
    git commit -am "chore: release vX.Y.Z"
    ```

### 3. Publishing
Push the tag to trigger the automated release pipeline:
```bash
git tag vX.Y.Z
git push && git push --tags
```
The GitHub Action will automatically:
- Build and test the project.
- Publish to NPM.
- Update the Homebrew formula.

## License

By contributing, you verify that you have the rights to your code and that you agree to license your contributions under the [Apache-2.0 License](./LICENSE).
