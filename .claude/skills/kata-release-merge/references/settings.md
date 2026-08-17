# Merge-Gate Trust Settings

These keys select the merge gate's trust policy. The read mechanic lives in
the shared [kata-settings reference](../../../agents/x-kata-settings.md).

<setting key="trustSource" default="top-contributors">

| Option | Meaning |
| --- | --- |
| `top-contributors` (default) | Trust the top `trustContributorCount` humans by contributor ranking. |
| `allowlist` | Trust exactly the logins in `trustAllowlist`. Empty list: no human. |

</setting>

<setting key="trustContributorCount" default="7">

Integer, minimum 1. Applies under `trustSource: top-contributors`; ignored
otherwise. Counts humans only; the CI app identity stays trusted.

</setting>

<setting key="trustAllowlist" default="[]">

String list of tracker logins. Applies under `trustSource: allowlist`;
ignored otherwise. An empty list trusts no human. The CI app identity stays
trusted under every source.

</setting>
