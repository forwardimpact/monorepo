# Review Rigor Settings

These keys select review rigor for every `kata-review` caller. The read
mechanic lives in the shared
[kata-settings reference](../../../agents/x-kata-settings.md).

<setting key="reviewPanel" default="standard">

| Profile | Spec panels | Design/plan panels | Implementation panels |
| --- | --- | --- | --- |
| `light` | product 1 + technical 1 | technical 1 + devex 1 | technical 1 + devex 1 |
| `standard` (default) | product 3 + technical 3 | technical 3 + devex 3 | technical 5 + devex 3 |
| `thorough` | product 5 + technical 5 | technical 5 + devex 5 | technical 5 + devex 5 |

</setting>

<setting key="reviewBlockingSeverity" default="medium">

| Option | Meaning |
| --- | --- |
| `blocker` | Address every confirmed consensus finding graded blocker. |
| `high` | Address blocker and high. |
| `medium` (default) | Address blocker, high, and medium. |
| `low` | Address every confirmed consensus finding. |

</setting>

The floor means: address every confirmed consensus finding at the floor
severity or above.
