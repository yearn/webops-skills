---
name: vuln-report-triage
description: Triage inbound vulnerability reports to determine if they warrant investigation or can be closed
---

## Activation Criteria
Use this skill when:
- User says "/vuln-report-triage"
- User asks to triage a vulnerability report
- User shares a vulnerability report and wants to know if it's valid

## Input

A raw vulnerability report submitted by an external researcher, targeting a system we operate. The user may provide this as:
- Pasted text in the conversation
- A file path to a report
- A URL to a report on a platform (e.g., HackerOne, Immunefi)

If the input is unclear or missing, use `AskUserQuestion` to ask the user for the report content.

## Triage Process

Work through these checks in order. Stop as soon as you reach a definitive conclusion.

### Step 1: Known false positive pattern

Before analyzing the technical claims, research whether this report pattern is already known to be invalid for the platform in question (e.g., Discourse, Ghost, WordPress, etc.).

**Search the platform's official security documentation:**
- Find the vendor's security policy, responsible disclosure page, or bug bounty scope. Vendors often explicitly list vulnerability classes they consider out of scope.
- Check if the vendor has published security advisories or blog posts addressing this exact pattern.

**Search the platform's community forums and issue trackers:**
- Search the vendor's community forums for the specific claim.
- Search the vendor's GitHub issues for prior reports of the same pattern.
- Look for vendor team responses that explain why the behavior is by design.

**Search for prior CVEs for the same component:**
- If real CVEs exist for the same component but describe different issues, that's a strong signal the reported pattern was already evaluated and not considered a vulnerability.

**Check for templated / "beg bounty" report indicators:**
- Boilerplate impact sections that claim XSS + RCE + privilege escalation + device hijack from a single low-severity finding
- Generic PoC code that only demonstrates framing a page or getting a 200 OK, without exfiltrating any actual data
- Identical report structure sent across many targets (numbered report titles like "Report 01", "Report 02")
- Impact claims that are technically impossible given the vulnerability class (e.g., "malware execution" from clickjacking)

If the report matches a known false positive pattern, or the vendor has already dismissed this class of finding, or the report shows clear signs of templated bulk submission, stop here.

**Verdict: INVALID -- Known false positive pattern**

### Step 2: Ownership and control

Determine whether the reported issue is within our control or is inherent to a third-party platform we use.

- Is this a configuration we control, or is it baked into the platform?
- Does the platform vendor consider this in-scope for their own security program?
- Could we remediate this without modifying the upstream platform?

If the issue is entirely a platform-level behavior that we cannot control and the vendor considers it out of scope or by design, stop here.

**Verdict: INFORMATIONAL -- Third-party platform behavior outside our control**

### Step 3: Attack chain validation

Examine whether the proof-of-concept actually demonstrates the claimed impact.

- Does the PoC show real sensitive data being exfiltrated, or just benign responses (status codes, position markers, empty values)?
- Does the attack chain work end-to-end, or does it rely on a step that fails in practice (e.g., browser CORS enforcement, missing credentials header)?
- Are there existing platform-level mitigations that break the attack chain (e.g., SAMEORIGIN on the actual auth endpoint, session binding on tokens)?

If the PoC does not demonstrate the claimed impact and the attack chain does not work end-to-end, stop here.

**Verdict: INVALID -- Attack chain does not succeed**

### Step 4: Severity assessment

If the vulnerability has some technical basis, assess whether the claimed severity matches reality.

- Do the impact claims (account takeover, RCE, privilege escalation) logically follow from the technical evidence?
- Is the affected surface actually sensitive (admin panel vs. public newsletter)?
- What is the realistic worst-case scenario, not the theoretical one?

If the technical observation is real but the severity is grossly overstated and the practical risk is negligible, stop here.

**Verdict: INFORMATIONAL -- Real observation, negligible practical risk**

### Step 5: Escalate

If none of the above checks invalidated the report, it may be legitimate.

**Verdict: INVESTIGATE -- Report may be valid, requires deeper analysis**

## Output

After completing the triage, present findings in this format:

```
VERDICT: [INVALID | INFORMATIONAL | INVESTIGATE]
REASON: [One-line reason]
STOPPED AT: Step [N]

ANALYSIS:
[2-4 sentences explaining why you reached this verdict at this step.
Reference specific technical details from the report that support your conclusion.]
```

Then, based on the verdict, create a plan for next steps and show it to the user for a go ahead. The plan should include:

- **INVALID**: Draft a response to the reporter explaining why the report is invalid, citing specific evidence found during triage.
- **INFORMATIONAL**: Draft a response acknowledging the observation, explaining why it's outside our control or negligible risk, and whether any defensive hardening is worth considering.
- **INVESTIGATE**: Outline specific technical steps to validate the vulnerability (e.g., reproduce the PoC, check configurations, review logs).

**CRITICAL: Always create a plan and show it to the user for a go ahead before taking any action.**
