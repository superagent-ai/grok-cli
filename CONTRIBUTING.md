# Contributing to Grok CLI

_Last updated: November 2025_

Thank you for your interest in contributing to Grok CLI!  
We welcome contributions from the community, including bug fixes, new features, documentation improvements, and tests.

---

## 🛠️ Getting Started

**1. Fork the repository** and clone it locally:

   ```bash
   git clone https://github.com/<your-username>/grok-cli.git
   cd grok-cli
````

**2. Install dependencies**:

   ```bash
   bun install
   ```
**3. Build the project**:

   ```bash
   bun run build
   ```
**4. Run the CLI locally**:

   ```bash
   bun run dev
   ```

---

## 📋 Contribution Guidelines

* **Branching**:

  * Create a feature branch from `main`:

    ```bash
    git checkout -b feature/my-feature
    ```
  * Use descriptive branch names: `feature/`, `bugfix/`, `docs/`

* **Commits**:

  * Write clear, concise commit messages:

    ```
    feat: add new Fast Apply command
    fix: resolve issue with file upload
    docs: update README with new instructions
    ```
  * Follow [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/)

* **Coding Style**:

  * TypeScript for all source files.
  * Functional React components (hooks) for UI components.
  * Add JSDoc comments for public functions.
  * Follow existing patterns in the project.

* **Tests**:

  * Write tests for new functionality or bug fixes.
  * Ensure all existing tests pass:

    ```bash
    bun run test
    ```

---

## 🔄 Pull Requests

1. **Fork & branch** your changes.
2. **Commit** following the guidelines above.
3. **Push** your branch:

   ```bash
   git push origin feature/my-feature
   ```
4. **Open a pull request** against `main`.
5. **Describe your changes clearly** in the PR description.
6. **Link related issues** if applicable.
7. PRs will be **reviewed**, feedback may be requested, and CI checks must pass before merging.

---

## ⚠️ Safety Considerations

* Avoid including API keys or sensitive data in commits.
* Test your changes with `--dry-run` when commands may affect files or system.
* Do **not** upload real user data during testing.

---

## 🤝 Code of Conduct

* Be respectful and constructive in discussions.
* Help maintain a positive community.
* Report abusive behavior to the maintainers.

---

