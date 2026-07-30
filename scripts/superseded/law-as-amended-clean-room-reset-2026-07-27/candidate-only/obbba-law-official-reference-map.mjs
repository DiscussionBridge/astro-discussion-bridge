export const OFFICIAL_REFERENCE_MAP_PROFILE =
  "obbba-official-reference-map-v1";

export function mapOfficialReference(originalHref, { releaseRole } = {}) {
  if (!["before", "current"].includes(releaseRole)
    || typeof originalHref !== "string") {
    throw new Error("Official reference mapping input is invalid.");
  }
  const segments = originalHref.split("/");
  if (segments[0] !== "" || segments[1] !== "us"
    || !["usc", "pl", "stat", "act"].includes(segments[2])
    || segments.length < 4
    || segments.slice(3).some((segment) =>
      !/^[A-Za-z0-9._~!$&'()*+,;=:@–-]+$/u.test(segment)
      || segment === "." || segment === "..")) {
    throw new Error("Official reference path is outside the reviewed grammar.");
  }
  const namespace = segments[2];
  const base = {
    profile: OFFICIAL_REFERENCE_MAP_PROFILE,
    originalHref,
    namespace,
    releaseRole,
  };
  if (namespace === "usc") return mapUsc(base, segments.slice(3));
  if (namespace === "pl") return mapPublicLaw(base, segments.slice(3));
  if (namespace === "stat") return mapStatute(base, segments.slice(3));
  return {
    ...base,
    resolution: "preserved-non-clickable",
    reason: "no-reviewed-official-act-resolver",
  };
}

function mapUsc(base, segments) {
  const title = /^t([1-9]\d*)$/.exec(segments[0])?.[1];
  const section = /^s([A-Za-z0-9]+(?:[.–-][A-Za-z0-9]+)*)$/.exec(
    segments[1] ?? "",
  )?.[1];
  if (!title || !section) {
    return unresolved(base, "usc-path-is-not-a-section-reference");
  }
  if (base.releaseRole !== "current") {
    return unresolved(base, "prior-release-section-url-not-reviewed");
  }
  const canonicalSection = section.replaceAll("–", "-");
  const query = new URLSearchParams({
    req: `granuleid:USC-prelim-title${title}-section${canonicalSection}`,
    num: "0",
    edition: "prelim",
  });
  let fragment = "";
  if (segments.length > 2) {
    const enumerators = segments.slice(2);
    if (enumerators.some((value) => !/^[A-Za-z0-9]+$/.test(value))) {
      return {
        ...base,
        resolution: "verified-official-link",
        mappedUrl:
          `https://uscode.house.gov/view.xhtml?${query.toString()}`,
        authority: "Office of the Law Revision Counsel",
        fragmentResolution: "omitted-unreviewed-substructure",
      };
    }
    fragment = `#substructure-location_${enumerators.join("_")}`;
  }
  return {
    ...base,
    resolution: "verified-official-link",
    mappedUrl:
      `https://uscode.house.gov/view.xhtml?${query.toString()}${fragment}`,
    authority: "Office of the Law Revision Counsel",
  };
}

function mapPublicLaw(base, segments) {
  if (!/^[1-9]\d*$/.test(segments[0])
    || !/^[1-9]\d*$/.test(segments[1])) {
    return unresolved(base, "public-law-identity-is-not-canonical");
  }
  return {
    ...base,
    resolution: "verified-official-link",
    mappedUrl:
      `https://www.govinfo.gov/app/details/PLAW-${segments[0]}publ${segments[1]}`,
    authority: "U.S. Government Publishing Office",
  };
}

function mapStatute(base, segments) {
  const page = /^([1-9]\d*)(?:[–-]([1-9]\d*))?$/.exec(
    segments[1] ?? "",
  );
  if (!/^[1-9]\d*$/.test(segments[0]) || !page
    || (page[2] && Number(page[1]) > Number(page[2]))) {
    return unresolved(base, "statutes-at-large-citation-is-not-canonical");
  }
  return {
    ...base,
    resolution: "verified-official-link",
    mappedUrl:
      `https://www.govinfo.gov/app/details/STATUTE-${segments[0]}`,
    authority: "U.S. Government Publishing Office",
  };
}

function unresolved(base, reason) {
  return {
    ...base,
    resolution: "preserved-non-clickable",
    reason,
  };
}
