/**
 * Shared MINI_TERRAIN DSL fixture for activity tests.
 *
 * Two scenarios over different timeranges hit team alpha (declining on
 * deep_work/ease_of_release) and team beta (rising on
 * learning_culture/connectedness). Used by `activity.test.js`,
 * `prose-activity.test.js`, and `file-path-parity.test.js` so all three
 * test files share the same generated entity graph and the file-path
 * baseline asserts post-refactor parity against the same input.
 *
 * Seeded `42` per the DSL so generation is reproducible. Regenerate the
 * baseline (`file-path-baseline.json`) only when this fixture itself
 * changes — see `README.md` in this directory.
 */
export const MINI_TERRAIN = `terrain test {
  domain "test.example"
  seed 42

  org hq { name "HQ" location "NY" }

  department eng {
    name "Engineering"
    parent hq
    headcount 10

    team alpha {
      name "Alpha Team"
      size 5
      manager @zeus
      repos ["repo-a"]
    }

    team beta {
      name "Beta Team"
      size 5
      manager @hera
      repos ["repo-b"]
    }
  }

  people {
    count 10
    names "greek_mythology"
    distribution {
      L1 40%
      L2 30%
      L3 20%
      L4 10%
    }
    disciplines {
      software_engineering 80%
      data_engineering 20%
    }
  }

  project proj_a {
    name "Project Alpha"
    type "platform"
    teams [alpha, beta]
    timeline_start 2024-06
    timeline_end 2025-06
  }

  snapshots {
    quarterly_from 2024-07
    quarterly_to 2025-07
    account_id "acct_test"
    comments_per_snapshot 5
  }

  scenario pressure {
    name "Release Pressure"
    timerange_start 2024-07
    timerange_end 2025-01

    affect alpha {
      github_commits "spike"
      github_prs "elevated"
      dx_drivers {
        deep_work { trajectory "declining" magnitude -6 }
        ease_of_release { trajectory "declining" magnitude -4 }
      }
      evidence_skills [architecture_design]
      evidence_floor "working"
    }
  }

  scenario improvement {
    name "Culture Improvement"
    timerange_start 2025-01
    timerange_end 2025-06

    affect beta {
      github_commits "moderate"
      github_prs "moderate"
      dx_drivers {
        learning_culture { trajectory "rising" magnitude 5 }
        connectedness { trajectory "rising" magnitude 3 }
      }
      evidence_skills [team_collaboration]
      evidence_floor "foundational"
    }
  }

  standard {
    proficiencies [awareness, foundational, working, practitioner, expert]
    drivers {
      deep_work {
        name "Deep Work"
        skills [architecture_design, data_integration]
        behaviours []
      }
      ease_of_release {
        name "Ease of Release"
        skills [change_management, sre_practices]
        behaviours []
      }
      learning_culture {
        name "Learning Culture"
        skills [mentoring, technical_writing]
        behaviours []
      }
      connectedness {
        name "Connectedness"
        skills [team_collaboration, stakeholder_management]
        behaviours []
      }
    }
  }
}`;
