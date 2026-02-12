# GitHub Native Setup Script
# Run this script after authenticating `gh` CLI: `gh auth login`
# This creates milestones, labels, and the GitHub Project board.

$ErrorActionPreference = "Stop"
$OWNER = "putersdcat"
$REPO = "EmilysGame"

Write-Host "=== Emily's Game — GitHub Native Setup ===" -ForegroundColor Cyan

# ─── 1. CREATE MILESTONES ────────────────────────────────────────────
Write-Host "`n--- Creating Milestones ---" -ForegroundColor Yellow

$milestones = @(
    @{ title = "PoC Complete"; description = "Isometric engine, basic rendering, player movement, collision, input handling" },
    @{ title = "Core Gameplay"; description = "LLM entropy, world generation, quizzes, inventory, NPC interactions" },
    @{ title = "Content & Polish"; description = "Book of Knowledge, content pipeline, sprite customization, UI polish" },
    @{ title = "Infrastructure & Release"; description = "CI/CD pipeline, GitHub Pages deployment, performance optimizations, testing" }
)

foreach ($m in $milestones) {
    Write-Host "  Creating milestone: $($m.title)"
    gh api repos/$OWNER/$REPO/milestones -f title="$($m.title)" -f description="$($m.description)" -f state="open" 2>&1 | Out-Null
}

# ─── 2. CREATE LABELS ────────────────────────────────────────────────
Write-Host "`n--- Creating Labels ---" -ForegroundColor Yellow

$labels = @(
    @{ name = "epic"; color = "5319e7"; description = "High-level feature epic" },
    @{ name = "task"; color = "0075ca"; description = "Implementation task" },
    @{ name = "feature"; color = "a2eeef"; description = "New feature" },
    @{ name = "performance"; color = "d93f0b"; description = "Performance optimization" },
    @{ name = "ui"; color = "7057ff"; description = "User interface" },
    @{ name = "rendering"; color = "006b75"; description = "Rendering engine" },
    @{ name = "llm"; color = "e4e669"; description = "LLM integration" },
    @{ name = "world-generation"; color = "0e8a16"; description = "World/tile generation" },
    @{ name = "education"; color = "fbca04"; description = "Educational content / quizzes" },
    @{ name = "infrastructure"; color = "d4c5f9"; description = "Build, CI/CD, tooling" },
    @{ name = "ci-cd"; color = "c5def5"; description = "CI/CD pipeline" },
    @{ name = "sprites"; color = "f9d0c4"; description = "Sprite system" },
    @{ name = "art"; color = "bfdadc"; description = "Art and visual assets" },
    @{ name = "tooling"; color = "c2e0c6"; description = "Developer tooling" },
    @{ name = "high-priority"; color = "b60205"; description = "High priority item" },
    @{ name = "roadmap"; color = "1d76db"; description = "Roadmap / planning" }
)

foreach ($l in $labels) {
    Write-Host "  Creating label: $($l.name)"
    gh label create "$($l.name)" --repo "$OWNER/$REPO" --color "$($l.color)" --description "$($l.description)" --force 2>&1 | Out-Null
}

# ─── 3. ASSIGN LABELS TO EXISTING ISSUES ─────────────────────────────
Write-Host "`n--- Assigning Labels to Issues ---" -ForegroundColor Yellow

$issueLabels = @{
    1  = @("task", "performance", "high-priority")
    2  = @("epic", "roadmap")
    3  = @("epic", "rendering")
    4  = @("epic", "llm", "world-generation")
    5  = @("epic", "sprites", "art")
    6  = @("epic", "world-generation", "art")
    7  = @("epic", "education", "feature")
    8  = @("task", "education", "tooling")
    9  = @("task", "infrastructure", "ci-cd")
    10 = @("task", "ui", "feature")
}

foreach ($issue in $issueLabels.GetEnumerator()) {
    $num = $issue.Key
    $labs = $issue.Value -join ","
    Write-Host "  Issue #$num → $labs"
    gh issue edit $num --repo "$OWNER/$REPO" --add-label $labs 2>&1 | Out-Null
}

# ─── 4. ASSIGN MILESTONES TO ISSUES ──────────────────────────────────
Write-Host "`n--- Assigning Milestones to Issues ---" -ForegroundColor Yellow

$issueMilestones = @{
    1  = "Infrastructure & Release"
    3  = "PoC Complete"
    4  = "Core Gameplay"
    5  = "PoC Complete"
    6  = "Core Gameplay"
    7  = "Content & Polish"
    8  = "Content & Polish"
    9  = "Infrastructure & Release"
    10 = "PoC Complete"
}

foreach ($im in $issueMilestones.GetEnumerator()) {
    $num = $im.Key
    $ms = $im.Value
    Write-Host "  Issue #$num → Milestone: $ms"
    gh issue edit $num --repo "$OWNER/$REPO" --milestone "$ms" 2>&1 | Out-Null
}

# ─── 5. CREATE GITHUB PROJECT ────────────────────────────────────────
Write-Host "`n--- Creating GitHub Project V2 ---" -ForegroundColor Yellow
Write-Host "  Note: Projects V2 are user-level, not repo-level."

# Create the project (idempotent)
$projTitle = "EmilysGame - Development Roadmap"
Write-Host "  Looking for existing project titled '$projTitle'..."
$gql = @"
query {
  user(login: \"$OWNER\") {
    projectsV2(first:100) { nodes { number title } }
  }
}
"@
$projectsRaw = gh api graphql -f query="$gql" 2>&1
$projectsJson = ($projectsRaw | Out-String).Trim()
try {
    $projects = $projectsJson | ConvertFrom-Json
    $existing = $projects.data.user.projectsV2.nodes | Where-Object { $_.title -eq $projTitle } | Select-Object -ExpandProperty number -First 1
} catch {
    $existing = $null
}

if ($existing) {
    $projectNumber = $existing.ToString()
    Write-Host "  Found existing project #$projectNumber"
} else {
    Write-Host "  Creating new project..."
    $projectNumberRaw = gh project create --owner "@me" --title $projTitle --format json --jq '.number' 2>&1
    $projectNumber = ($projectNumberRaw | Out-String).Trim()
    Write-Host "  Created project #$projectNumber"

# Validate project number is numeric (gh may return error text if creation failed or scopes are missing)
if (-not ($projectNumber -match '^\d+$')) {
    Write-Error "Project creation/fetch failed: $projectNumber"
    Write-Host "Please run: gh auth refresh -s project,read:project"
    exit 1
}
}

# Link repository to project — skip if already linked
Write-Host "  Checking if repository is already linked to project #$projectNumber..."
$repoId = gh api repos/$OWNER/$REPO --jq '.node_id' 2>&1
$repoId = ($repoId | Out-String).Trim()
if ($repoId -match '(^|\b)(error|gh:|Usage:|flag:|expected)') {
    Write-Error "Failed to obtain repository node id. Output:\n$repoId"
    exit 1
}
if ([string]::IsNullOrWhiteSpace($repoId)) {
    Write-Error "Repository node id is empty"
    exit 1
}

# Query the repository's projects to see if the project number is already present
$repoProjectsRaw = gh api graphql -f query="query { repository(owner:\"$OWNER\", name:\"$REPO\") { projectsV2(first:100) { nodes { number } } } }" --jq '.data.repository.projectsV2.nodes[].number' 2>&1
$repoProjectsRaw = ($repoProjectsRaw | Out-String).Trim()
$repoProjectsFetchFailed = $false
if ($repoProjectsRaw -match '(^|\b)(error|gh:|Usage:|flag:|expected)') {
    Write-Warning "Warning: unexpected output when fetching repository projects: $repoProjectsRaw"
    $repoProjects = @()
    $repoProjectsFetchFailed = $true
} else {
    $repoProjects = $repoProjectsRaw.Split("`n") | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne '' }
}

if ($repoProjects -contains $projectNumber.ToString()) {
    Write-Host "  Repository is already linked to project #$projectNumber — skipping link."
} elseif ($repoProjectsFetchFailed) {
    Write-Warning "Could not verify repository → project link due to API output; skipping link to avoid mutation failures."
} else {
    Write-Host "  Repository not linked — linking now..."
    $projectId = gh api graphql -f query="query { user(login:\"$OWNER\") { projectV2(number: $projectNumber) { id } } }" --jq '.data.user.projectV2.id' 2>&1
    $projectId = ($projectId | Out-String).Trim()
    if ($projectId -match '(^|\b)(error|gh:|Usage:|flag:|expected)') {
        Write-Error "Failed to obtain project node id. Output:\n$projectId"
        exit 1
    }
    if ([string]::IsNullOrWhiteSpace($projectId)) {
        Write-Error "Project node id is empty"
        exit 1
    }

    # Use GraphQL variables to avoid quoting/escaping issues
    $mutationQuery = 'mutation ($pid: ID!, $rid: ID!) { linkProjectV2ToRepository(input: { projectId: $pid, repositoryId: $rid }) { repository { name } } }'
    $mutationResult = gh api graphql -f query="$mutationQuery" -f pid="$projectId" -f rid="$repoId" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Failed to link repository to project: $mutationResult"
        exit 1
    }
    Write-Host "  Repository linked."
}

# Add custom fields
Write-Host "  Adding custom fields..."
gh project field-create $projectNumber --owner "@me" --name "Priority" --data-type "SINGLE_SELECT" --single-select-options "High,Medium,Low" 2>&1 | Out-Null
gh project field-create $projectNumber --owner "@me" --name "Dependencies" --data-type "TEXT" 2>&1 | Out-Null
gh project field-create $projectNumber --owner "@me" --name "Acceptance Criteria" --data-type "TEXT" 2>&1 | Out-Null

# Add all issues to the project
Write-Host "`n  Adding issues to project..."
for ($i = 1; $i -le 10; $i++) {
    Write-Host "    Adding issue #$i"
    gh project item-add $projectNumber --owner "@me" --url "https://github.com/$OWNER/$REPO/issues/$i" 2>&1 | Out-Null
}

Write-Host "`n=== Setup Complete! ===" -ForegroundColor Green
Write-Host "Project URL: https://github.com/users/$OWNER/projects/$projectNumber"
Write-Host "`nNext steps:"
Write-Host "  1. Visit the project URL above"
Write-Host "  2. Add a Board view (Kanban) grouped by Status"
Write-Host "  3. Add a Table view sorted by Priority"
Write-Host "  4. Configure Status column options: Backlog, Prioritized, In Progress, Review, Done"
