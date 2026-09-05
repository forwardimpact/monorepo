// The Actions-variable latch. It reads both scopes, because every killswitch
// reader resolves the repository variable first and the organization variable
// otherwise. It writes the repository scope only.

import { API } from "../request.js";

/**
 * Read the next page path out of a `Link` header.
 * @param {*} headers - The response headers.
 * @returns {?string} The next path, or `null` at the end of the listing.
 */
function nextLink(headers) {
  const link = headers.get("link");
  if (!link) return null;
  const match = link.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1].replace(API, "") : null;
}

/**
 * Shape one API record as a latch record.
 * @param {?object} record - The API record, or a falsy value when absent.
 * @returns {?{value: string, updatedAt: string}} The latch record.
 */
function toRecord(record) {
  return record ? { value: record.value, updatedAt: record.updated_at } : null;
}

/**
 * Read the repository-scoped record.
 * @param {Function} request - The REST request function.
 * @param {string} repo - `owner/repo`.
 * @param {string} name - The variable's name.
 * @returns {Promise<?{value: string, updatedAt: string}>} The record, or `null`
 *   when the variable does not exist at this scope.
 */
async function readRepository(request, repo, name) {
  try {
    const { body } = await request(
      `/repos/${repo}/actions/variables/${encodeURIComponent(name)}`,
    );
    return toRecord(body);
  } catch (error) {
    // An absent variable reads as absent, not as a failed read. Every other
    // status is a read failure the caller must treat as fatal.
    if (error.status === 404) return null;
    throw error;
  }
}

/**
 * Page the organization listing for one variable.
 * @param {Function} request - The REST request function.
 * @param {string} repo - `owner/repo`.
 * @param {string} name - The variable's name.
 * @returns {Promise<?{value: string, updatedAt: string}>} The record, or `null`
 *   when the listing does not carry it.
 */
async function readOrganization(request, repo, name) {
  let path = `/repos/${repo}/actions/organization-variables?per_page=30`;
  while (path) {
    let page;
    try {
      page = await request(path);
    } catch (error) {
      // A repository under a personal account has no organization scope, and
      // GitHub answers 404. That is an absent record, not a failed read. A
      // 403 is the missing grant, and it stays fatal.
      if (error.status === 404) return null;
      throw error;
    }
    const found = (page.body?.variables ?? []).find(
      (variable) => variable.name === name,
    );
    if (found) return toRecord(found);
    path = nextLink(page.headers);
  }
  return null;
}

/**
 * Build the Actions-variable latch.
 * @param {object} input
 * @param {Function} input.request - The REST request function.
 * @param {string} input.repo - `owner/repo`.
 * @param {string} input.name - The latch variable's name.
 * @returns {{read: Function, write: Function}} The latch.
 */
export function createActionsVariableLatch({ request, repo, name }) {
  /**
   * Read the repository record, then page the organization listing.
   * @returns {Promise<object>} The two records, the effective scope, the
   *   effective value, and that record's `updated_at`.
   */
  async function read() {
    const repository = await readRepository(request, repo, name);
    const organization = await readOrganization(request, repo, name);
    const effective = repository ?? organization;
    const scope = repository
      ? "repository"
      : organization
        ? "organization"
        : null;

    return {
      repository,
      organization,
      scope,
      value: effective ? effective.value : null,
      updatedAt: effective ? effective.updatedAt : null,
    };
  }

  /**
   * Write the repository-scoped variable, creating it when it does not exist.
   * @param {string} value - The value to write. Never falsy.
   * @returns {Promise<void>} Resolves once the write lands.
   */
  async function write(value) {
    const body = JSON.stringify({ name, value });
    const headers = { "Content-Type": "application/json" };
    try {
      await request(
        `/repos/${repo}/actions/variables/${encodeURIComponent(name)}`,
        { method: "PATCH", body, headers },
      );
    } catch (error) {
      if (error.status !== 404) throw error;
      await request(`/repos/${repo}/actions/variables`, {
        method: "POST",
        body,
        headers,
      });
    }
  }

  return { read, write };
}
