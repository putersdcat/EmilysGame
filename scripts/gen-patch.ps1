

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outputDir = "C:\Temp"
$patchNamePrefix = "EmilysGame-local-iso2-work-"
$patch = Join-Path $outputDir "$patchNamePrefix$timestamp.patch"
$differentialPatch = Join-Path $outputDir "EmilysGame-local-iso2-differential-$timestamp.patch"
$tmpIndex = Join-Path $env:TEMP ("emilysgame-transfer-index-" + [guid]::NewGuid())
$previousPatchIndex = Join-Path $env:TEMP ("emilysgame-previous-patch-index-" + [guid]::NewGuid())
$originalGitIndexFile = $env:GIT_INDEX_FILE

New-Item -ItemType Directory -Path $outputDir -Force | Out-Null
$previousPatchCandidates = @(Get-ChildItem -Path $outputDir -File -Filter "$patchNamePrefix*.patch" |
	Where-Object { $_.Name -match "^$([regex]::Escape($patchNamePrefix))\d{8}-\d{6}\.patch$" } |
	Sort-Object LastWriteTimeUtc -Descending)

# Diff against the upstream tracking branch (not HEAD). Diffing against HEAD
# only shows "working tree vs last local commit" -- if anything has already
# been committed locally (e.g. an agent session committing its own
# work-in-progress), that delta is already IN HEAD and silently disappears
# from a HEAD-relative diff even though origin still doesn't have it. Diffing
# against upstream instead captures BOTH still-uncommitted changes AND any
# local commits already made ahead of origin, in one combined patch.
$upstream = git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>$null
if (-not $upstream) { $upstream = 'origin/experiment/isometric-2.0' }

$wroteDifferentialPatch = $false
$differentialBasePatch = $null
$differentialPatchWasEmpty = $false
$skippedPreviousPatchCount = 0
try {
	Copy-Item .git/index $tmpIndex
	$env:GIT_INDEX_FILE = $tmpIndex

	git add -A
	# Exclude known per-machine-local files that are expected to independently
	# differ on every machine and are never meant to sync via this patch (a
	# personal tool-permissions file and this script itself). Including them
	# just produces guaranteed, harmless-but-noisy apply failures on the remote
	# ("does not match index" / "does not exist in index") since the remote
	# already has its own differing copy of each -- observed 2026-07-08.
	git reset -- ".github/agents/GameMan.agent.md" "scripts/gen-patch.ps1" *>$null
	$currentTree = git write-tree
	git diff --binary --full-index $upstream $currentTree > $patch

	foreach ($candidatePatch in $previousPatchCandidates) {
		$env:GIT_INDEX_FILE = $previousPatchIndex
		Remove-Item $previousPatchIndex -ErrorAction SilentlyContinue
		git read-tree $upstream
		if ($LASTEXITCODE -ne 0) {
			throw "Could not read upstream tree '$upstream' into temporary index."
		}

		# Differential generation is intentionally best-effort: a saved patch can
		# only be used as the "previous state" if it still applies cleanly to the
		# same base ref used for the new full patch. Once origin has absorbed part
		# of an older patch (for example, deleted screenshot artifacts are already
		# gone), replaying that patch becomes base-incompatible and git emits a
		# wall of harmless-but-confusing "does not exist in index" messages. Check
		# quietly first, skip incompatible snapshots, and keep the full patch valid.
		git apply --check --cached --3way --binary $candidatePatch.FullName *> $null
		if ($LASTEXITCODE -ne 0) {
			$skippedPreviousPatchCount++
			continue
		}

		git read-tree $upstream
		git apply --cached --3way --binary $candidatePatch.FullName *> $null
		if ($LASTEXITCODE -ne 0) {
			$skippedPreviousPatchCount++
			continue
		}

		$previousTree = git write-tree
		git diff --binary --full-index $previousTree $currentTree > $differentialPatch
		$differentialBasePatch = $candidatePatch
		if ((Get-Item $differentialPatch).Length -gt 0) {
			$wroteDifferentialPatch = $true
		}
		else {
			$differentialPatchWasEmpty = $true
			Remove-Item $differentialPatch -ErrorAction SilentlyContinue
		}
		break
	}
}
finally {
	if ($null -eq $originalGitIndexFile) {
		Remove-Item Env:\GIT_INDEX_FILE -ErrorAction SilentlyContinue
	}
	else {
		$env:GIT_INDEX_FILE = $originalGitIndexFile
	}

	Remove-Item $tmpIndex -ErrorAction SilentlyContinue
	Remove-Item $previousPatchIndex -ErrorAction SilentlyContinue
}

Write-Host "Wrote patch to $patch (base: $upstream)"
if ($wroteDifferentialPatch) {
	Write-Host "Wrote differential patch to $differentialPatch (since: $($differentialBasePatch.FullName))"
	if ($skippedPreviousPatchCount -gt 0) {
		Write-Host "Skipped $skippedPreviousPatchCount incompatible older patch(es) while looking for a replayable baseline."
	}
}
elseif ($differentialPatchWasEmpty) {
	Write-Host "No differential changes since compatible previous patch: $($differentialBasePatch.FullName)"
	if ($skippedPreviousPatchCount -gt 0) {
		Write-Host "Skipped $skippedPreviousPatchCount incompatible older patch(es) while looking for a replayable baseline."
	}
}
elseif ($previousPatchCandidates.Count -gt 0) {
	Write-Host "Could not generate a differential patch: no saved patch applies cleanly to current base $upstream."
	Write-Host "Skipped $skippedPreviousPatchCount incompatible previous patch(es). Use the full patch above."
}
else {
	Write-Host "No previous patch found in $outputDir; skipped differential patch."
}
Write-Host ""
Write-Host "To apply this patch on the remote system, use:"
Write-Host "  git apply --3way --binary $patch"
if ($wroteDifferentialPatch) {
	Write-Host ""
	Write-Host "To apply only the changes since the previous patch, use:"
	Write-Host "  git apply --3way --binary $differentialPatch"
}