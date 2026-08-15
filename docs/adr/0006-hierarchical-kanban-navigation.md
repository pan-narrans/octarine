# ADR 0006: Hierarchical Kanban Navigation & Dynamic Project Tagging

## Status

Proposed

## Implementation Status

Partial. Hierarchical project extraction and descendant query matching exist. The complete relative Kanban navigation and display contract has not been implemented or verified as described.

## Context

Octarine utilizes a plaintext hierarchical project pathing syntax (e.g., `+work/client-1/project-a`) as defined in ADR 0001.

Users need an intuitive Kanban board interface to manage and track task states. A standard Kanban view groups tasks into columns representing statuses (Todo, In Progress, Completed, Cancelled) matching task checkbox states (`[ ]`, `[/]`, `[x]`, `[-]`).

When browsing hierarchical projects, users navigate to specific nodes in the path tree (e.g., `+work`, `+work/client-1`, or `+work/client-1/project-a`).
They expect:

1. To see tasks belonging to the current node and all downstream descendants.
2. Clear, decluttered card layouts. Displaying the full hierarchical project path (e.g., `work/client-1/project-a`) on every card in the Kanban view generates visual clutter and excessive cognitive load, especially when the user has already navigated to the parent node.

## Decision

We will implement an automated, relative context-based scoping and tagging system for Kanban board visualization.

### 1. Kanban Column Mapping

Kanban boards will automatically group task cards into columns based on their parsed plaintext checkbox status:

- **Todo Column:** Matches standard tasks marked with `- [ ]` (Not Started).
- **In Progress Column:** Matches tasks marked with `- [/]` (In Progress).
- **Done Column:** Matches completed tasks marked with `- [x]` (Completed).
- **Cancelled Column:** Matches cancelled tasks marked with `- [-]` (Cancelled).
- _Exclusion Rule:_ Calendar events (`- [<]`) are excluded from standard Kanban task lanes by default to prevent schedule pollution, but can be toggled on as a dedicated timeline track.

### 2. Hierarchical Scoping (Filtering Rule)

Let $V$ represent the currently selected/viewed project path (e.g., `["work"]` for `+work`).
Let $P$ represent a task's full parsed project path attribute (e.g., `["work", "client-1", "project-a"]`).

A task is scoped as **visible** on the board if and only if $V$ is a prefix of $P$.

- Mathematical formulation:
  $$\text{Visible}(t) \iff \forall i \in [0, |V| - 1]: P[i] = V[i]$$
- SQLite Index Query compilation:
  ```sql
  SELECT * FROM tasks
  WHERE project = ?1 OR project LIKE ?1 || '/%';
  ```

### 3. Relative Sub-Project Tagging (Display Rule)

To maximize card real estate and declutter the board, task cards will dynamically display project badges relative to the currently navigated node $V$.

Let $R$ be the remaining subpath array after stripping prefix $V$ from $P$:
$$R = P[|V| \dots]$$

- **Direct Match Level ($|R| = 0$):**
  If the task belongs directly to the viewed project ($P = V$), **no project tag is displayed** on the card.
- **Descendant Level ($|R| > 0$):**
  The card displays a dynamic sub-project tag representing the relative downstream path $R$ formatted with slashes:
  $$\text{DisplayTag} = \text{Join}(R, "/")$$

#### Logical Verification against User Scenarios:

Using project structure `+work/client-1/project-a` and a task $t_1$ containing project attribute `+work/client-1/project-a`:

1. **Viewing node `+work` ($V = \text{["work"]}$):**
   - $V$ is a prefix of $P$ ($t_1$ is visible).
   - Prefix `["work"]` is removed. $R = \text{["client-1", "project-a"]}$.
   - **Result:** $t_1$ displays a sub-project tag: `client-1/project-a`.

2. **Viewing node `+work/client-1` ($V = \text{["work", "client-1"]}$):**
   - $V$ is a prefix of $P$ ($t_1$ is visible).
   - Prefix `["work", "client-1"]` is removed. $R = \text{["project-a"]}$.
   - **Result:** $t_1$ displays a sub-project tag: `project-a`.

3. **Viewing node `+work/client-1/project-a` ($V = \text{["work", "client-1", "project-a"]}$):**
   - $V$ matches $P$ exactly ($t_1$ is visible).
   - Prefix is completely removed. $R = []$ ($|R| = 0$).
   - **Result:** No sub-project tag is displayed on $t_1$.

## Consequences

- **Positive:** Declutters UI dynamically as the user explores the vault. Preserves full downstream structural context while eliminating redundant ancestor labels. Matches natural cognitive expectations.
- **Negative:** Requires dynamic UI rendering computations of path subsets based on routing state, slightly increasing frontend card rendering logic (trivial overhead, $O(d)$ where depth $d \le 10$).
