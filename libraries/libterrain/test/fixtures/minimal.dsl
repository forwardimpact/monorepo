terrain minimal {
  domain "test.example"
  industry "technology"
  seed 42

  org testorg {
    name "Test Organization"
  }

  department eng {
    name "Engineering"
    parent testorg
    headcount 5

    team alpha {
      name "Alpha Team"
      size 5
      manager @alpha_lead
      repos ["alpha-service"]
    }
  }

  people {
    count 5
    distribution {
      J040 60%
      J050 40%
    }
    disciplines {
      software-engineering 100%
    }
  }

  project testproj {
    name "Test Project"
    type "drug"
    teams [alpha]
    prose_topic "Testing synthetic generation"
    prose_tone "technical"
  }

  standard {
    proficiencies [awareness, foundational, working, practitioner, expert]
    maturities [emerging, developing, practicing, role-modeling, exemplifying]

    levels {
      J040 { title "Software Engineer" rank 1 experience "0-2 years" }
      J050 { title "Senior Engineer" rank 2 experience "2-5 years" }
    }

    capabilities {
      coding { name "Coding" skills [python-dev, code-review] }
    }

    behaviours {
      collaboration { name "Collaboration" }
    }

    disciplines {
      software-engineering {
        roleTitle "Software Engineer"
        core [python-dev]
        supporting [code-review]
      }
    }

    tracks {
      backend { name "Backend" }
    }

    drivers {
      clear-direction {
        name "Clear Direction"
        skills [python-dev]
        behaviours [collaboration]
      }
    }
  }

  scenario baseline {
    name "Baseline Scenario"
    timerange_start 2025-01
    timerange_end 2025-06

    affect alpha {
      github_commits "moderate"
      github_prs "moderate"
      dx_drivers {
        clear-direction { trajectory "rising" magnitude 3 }
      }
      evidence_skills [python-dev]
      evidence_floor "foundational"
    }
  }

  content guide-html {
    courses 2
    events 1
    blogs 3
  }
}
