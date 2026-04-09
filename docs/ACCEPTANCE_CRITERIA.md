# Acceptance Criteria

Last updated: 2026-04-09
Status: Canonical

## Purpose

This document defines the release gates for OSS Core and Pro Local.

A feature is not complete until it passes:

- functional acceptance
- UX acceptance
- output acceptance
- fallback acceptance
- documentation acceptance

## Global definition of done

Every shipped feature must satisfy all of the following:

### 1. Functional

- the runtime behavior exists
- tests cover expected and failure cases
- edge cases are handled cleanly

### 2. UX

- the output is understandable without reading source code
- the user knows what to do next
- the feature changes a real workflow decision

### 3. Interface

- CLI output works
- JSON output works
- MCP or hook output works where relevant

### 4. Fallback

- missing optional inputs degrade gracefully
- missing Pro installation does not break OSS
- invalid configuration returns actionable errors

### 5. Documentation

- canonical docs reflect the feature
- README or user-facing docs reflect user-visible changes
- examples or proof paths exist when needed

## OSS acceptance

### OSS-1 Setup

Pass when:

- one-command setup works for supported agents
- config files are created correctly
- setup output is understandable
- doctor or equivalent verification confirms health

### OSS-2 Contracts

Pass when:

- task contracts can be created, read, and validated
- invalid contracts show actionable errors
- contracts influence checks predictably

### OSS-3 Scope and policy

Pass when:

- out-of-scope changes are detected
- intended-file mismatches are detected
- rule severity is respected
- output explains why the rule triggered

### OSS-4 Validation and evidence

Pass when:

- required commands and evidence are checked
- missing proof is surfaced clearly
- the output explains the proof gap

### OSS-5 Review output

Pass when:

- verdict is visible
- residual risk is visible
- next actions are visible
- JSON output remains stable

### OSS-6 Deploy-readiness baseline

Pass when:

- production-shaped changes are surfaced at least at a baseline level
- output distinguishes normal review from operationally sensitive review

## Pro Local acceptance

### PRO-1 Rough intent to contract

Pass when:

- a vague request generates multiple smallest-safe task options
- each option includes likely files, validations, and risk surfaces
- the system explains why the suggested scope is safe
- users can refine into a usable contract

Fail if:

- output is generic
- output is only a paraphrase of the prompt

### PRO-2 Scope intelligence

Pass when:

- changed files are classified by role
- safe budget is explained
- spillover is identified
- split vs expand is recommended
- suggested batches are concrete

Fail if:

- output only says "too many files"

### PRO-3 Context quality

Pass when:

- stale or missing context is detected before coding
- the system identifies concrete missing inputs
- the system recommends concrete corrective actions

Fail if:

- output is just a score with vague guidance

### PRO-4 Repo memory and continuity

Pass when:

- repo memory persists locally
- future runs use stored memory
- repeated drift or repair patterns influence guidance

Fail if:

- stored memory has no visible effect on future decisions

### PRO-5 Stronger semantic detection

Pass when:

- Pro signals are more precise or more actionable than OSS
- structured analysis improves at least one critical workflow
- output includes remediation-oriented guidance

Fail if:

- Pro only adds more noisy findings

### PRO-6 Independent second-pass verification

Pass when:

- the second pass can surface concerns not present in the first pass
- it can reduce false confidence
- it can influence the final trust decision

Fail if:

- it mostly repeats the same summary

### PRO-7 Merge-to-deploy handoff

Pass when:

- production-sensitive changes are classified correctly
- output includes verify steps and rollback notes
- operational guidance is change-specific

Fail if:

- output is a generic checklist unrelated to the diff

## Commercial acceptance

The first paid release is only acceptable when:

- at least three Pro features feel painful to lose after two weeks of use
- the paid workflow beats a reasonable DIY setup for a daily AI-coding user
- the upgrade path is understandable in one sitting
- the value is clearly worth the planned price point

## Release gate

Do not claim "complete product" or "release-ready paid tier" unless:

- all canonical docs are aligned
- all required acceptance sections pass
- the user journey from vague request to merge/deploy handoff works end to end
