// Sample BU alumni network shown on the landing page.
// Every person is a real Boston University alum; degrees and achievements come
// from public sources (Wikipedia "List of Boston University people", BU, NASA).
// Edge labels describe a real shared field, program or school — not invented
// co-authorships.

import eaton from "@/assets/alumni/eaton.jpg.asset.json";
import eastman from "@/assets/alumni/eastman.jpg.asset.json";
import delmundo from "@/assets/alumni/delmundo.jpg.asset.json";
import fuller from "@/assets/alumni/fuller.jpg.asset.json";
import hyman from "@/assets/alumni/hyman.jpg.asset.json";
import nowinski from "@/assets/alumni/nowinski.jpg.asset.json";
import tracey from "@/assets/alumni/tracey.jpg.asset.json";
import weissman from "@/assets/alumni/weissman.jpg.asset.json";
import warren from "@/assets/alumni/warren.jpg.asset.json";
import bachelder from "@/assets/alumni/bachelder.jpg.asset.json";
import bailey from "@/assets/alumni/bailey.jpg.asset.json";
import daly from "@/assets/alumni/daly.jpg.asset.json";
import ciardi from "@/assets/alumni/ciardi.jpg.asset.json";
import hines from "@/assets/alumni/hines.jpg.asset.json";
import hall from "@/assets/alumni/hall.jpg.asset.json";

export type AlumNode = {
  id: string;
  name: string;
  degree: string;
  field: string;
  note: string;
  photo?: string;
  x: number;
  y: number;
};

export type AlumEdge = { from: string; to: string; label: string };

export const GRAPH_W = 1200;
export const GRAPH_H = 830;
export const HUB = { x: 600, y: 410 };

export const ALUMNI: AlumNode[] = [
  // Medicine & mind
  { id: "eaton", name: "Cora Smith Eaton", degree: "MED 1892", field: "Physician", note: "First woman licensed to practice medicine in North Dakota", photo: eaton.url, x: 320, y: 60 },
  { id: "crumpler", name: "Rebecca Lee Crumpler", degree: "MED 1864", field: "Physician", note: "First African American woman in the US to earn an MD", x: 85, y: 50 },
  { id: "eastman", name: "Charles Eastman", degree: "MED 1890", field: "Physician", note: "One of the first Native Americans to earn an MD", photo: eastman.url, x: 65, y: 250 },
  { id: "delmundo", name: "Fe del Mundo", degree: "MED '40", field: "Pediatrician", note: "National Scientist of the Philippines; founded its first pediatric hospital", photo: delmundo.url, x: 205, y: 235 },
  { id: "fuller", name: "Solomon Carter Fuller", degree: "MED 1897", field: "Neuropathologist", note: "Pioneering Alzheimer's research; first Black psychiatrist in the US", photo: fuller.url, x: 125, y: 440 },
  { id: "hyman", name: "Ray Hyman", degree: "CAS '50", field: "Psychologist", note: "Co-founder of modern scientific skepticism; Hick–Hyman law", photo: hyman.url, x: 70, y: 615 },
  { id: "nowinski", name: "Christopher Nowinski", degree: "GRS '17", field: "Neuroscientist", note: "Research on concussions and CTE in football", photo: nowinski.url, x: 215, y: 625 },
  { id: "tracey", name: "Kevin J. Tracey", degree: "MED '83", field: "Neurosurgeon", note: "CEO of the Feinstein Institutes; one of the world's most cited researchers", photo: tracey.url, x: 410, y: 675 },
  { id: "weissman", name: "Drew Weissman", degree: "MED '87", field: "Immunologist", note: "2023 Nobel Prize in Medicine for mRNA vaccine technology", photo: weissman.url, x: 585, y: 720 },
  { id: "warren", name: "Shields Warren", degree: "CAS '18", field: "Pathologist", note: "Helped found radiobiology; studied radioactive fallout", photo: warren.url, x: 820, y: 725 },
  // Space, physics & chemistry
  { id: "bachelder", name: "Myrtle Bachelder", degree: "WED '39", field: "Chemist", note: "Manhattan Project chemist; analyzed Apollo moon rocks", photo: bachelder.url, x: 950, y: 530 },
  { id: "hall", name: "Eldon C. Hall", degree: "GRS '47", field: "Computer scientist", note: "Led hardware design of the Apollo Guidance Computer", photo: hall.url, x: 1140, y: 510 },
  { id: "hines", name: "Bob Hines", degree: "ENG '97", field: "Astronaut", note: "NASA astronaut, SpaceX Crew-4 pilot, Artemis III backup", photo: hines.url, x: 930, y: 345 },
  { id: "ciardi", name: "David Ciardi", degree: "CAS '91", field: "Astrophysicist", note: "NASA medals for Kepler and TESS exoplanet work", photo: ciardi.url, x: 1140, y: 300 },
  { id: "daly", name: "Ruth Agnes Daly", degree: "GRS '84", field: "Astrophysicist", note: "Expansion and acceleration history of the universe", photo: daly.url, x: 945, y: 205 },
  { id: "bailey", name: "Solon Irving Bailey", degree: "CAS 1881", field: "Astronomer", note: "Classified variable stars in globular clusters", photo: bailey.url, x: 880, y: 50 },
];

export const EDGES: AlumEdge[] = [
  { from: "crumpler", to: "eaton", label: "Early women MDs" },
  { from: "crumpler", to: "eastman", label: "Medical firsts" },
  { from: "crumpler", to: "delmundo", label: "Child health" },
  { from: "eastman", to: "fuller", label: "MED 1890s" },
  { from: "fuller", to: "hyman", label: "Mind & brain" },
  { from: "fuller", to: "nowinski", label: "Brain disease" },
  { from: "nowinski", to: "tracey", label: "Neuroscience" },
  { from: "tracey", to: "weissman", label: "Immunology" },
  { from: "weissman", to: "warren", label: "Biomedicine" },
  { from: "warren", to: "bachelder", label: "Atomic age" },
  { from: "bachelder", to: "hall", label: "Apollo program" },
  { from: "hall", to: "hines", label: "Apollo → Artemis" },
  { from: "hines", to: "ciardi", label: "NASA" },
  { from: "ciardi", to: "daly", label: "Astrophysics" },
  { from: "ciardi", to: "bailey", label: "Variable stars" },
];

/** Spokes from the BU hub in the center, labeled with school + class year. */
export const HUB_EDGES: { to: string; label: string }[] = [
  { to: "fuller", label: "MED 1897" },
  { to: "nowinski", label: "GRS '17" },
  { to: "weissman", label: "MED '87" },
  { to: "bachelder", label: "WED '39" },
  { to: "hines", label: "ENG '97" },
];

export const initials = (name: string) =>
  name.split(/\s+/).filter((p) => /^[A-Z]/.test(p)).slice(0, 2).map((p) => p[0]).join("");
