"""Chennai gazetteer: coastline, water bodies, landmarks and localities.

Coordinates are approximate (±300 m) and are used to drive the synthetic
land-cover generator in ``synth.py``. When real Landsat / Sentinel-2 rasters
are available, ``synth.py`` can be swapped for a raster sampler and everything
downstream (model, explainer, simulator) stays the same.
"""
from __future__ import annotations

import numpy as np

# Study area (decimal degrees)
LAT_MIN, LAT_MAX = 12.840, 13.240
LON_MIN, LON_MAX = 80.100, 80.330
STEP = 0.005  # ≈ 550 m cells

KM_PER_DEG_LAT = 110.57
KM_PER_DEG_LON = 111.32 * np.cos(np.radians(13.04))

# Shoreline (lat, lon) from Kovalam side up to Ennore
COAST = np.array([
    (12.840, 80.2475), (12.880, 80.2500), (12.920, 80.2550), (12.950, 80.2595),
    (12.980, 80.2640), (13.000, 80.2715), (13.030, 80.2790), (13.055, 80.2840),
    (13.080, 80.2900), (13.100, 80.2965), (13.120, 80.3000), (13.150, 80.3060),
    (13.180, 80.3130), (13.210, 80.3210), (13.240, 80.3300),
])


def coast_lon(lat):
    return np.interp(lat, COAST[:, 0], COAST[:, 1])


# Rivers & canals: (name, [(lat, lon), ...], width_km)
RIVERS = [
    ("Adyar River", [(13.000, 80.100), (13.010, 80.140), (13.020, 80.170), (13.017, 80.200),
                     (13.022, 80.222), (13.018, 80.245), (13.012, 80.262), (13.010, 80.276)], 0.16),
    ("Cooum River", [(13.085, 80.100), (13.078, 80.140), (13.075, 80.180), (13.072, 80.210),
                     (13.074, 80.235), (13.072, 80.255), (13.070, 80.270), (13.068, 80.284)], 0.09),
    ("Buckingham Canal", [(13.220, 80.312), (13.150, 80.296), (13.100, 80.286), (13.080, 80.278),
                          (13.050, 80.272), (13.020, 80.265), (13.000, 80.262), (12.970, 80.252),
                          (12.930, 80.245), (12.880, 80.240), (12.840, 80.236)], 0.05),
    ("Otteri Nullah", [(13.095, 80.205), (13.100, 80.230), (13.105, 80.255), (13.112, 80.280)], 0.03),
]

# Lakes & wetlands: (name, lat, lon, radius_km)
LAKES = [
    ("Puzhal Lake", 13.165, 80.192, 2.0),
    ("Retteri Lake", 13.135, 80.197, 0.55),
    ("Korattur Lake", 13.115, 80.180, 0.70),
    ("Ambattur Lake", 13.106, 80.145, 0.55),
    ("Madhavaram Lake", 13.150, 80.242, 0.40),
    ("Porur Lake", 13.033, 80.150, 0.60),
    ("Velachery Lake", 12.982, 80.214, 0.35),
    ("Chitlapakkam Lake", 12.935, 80.145, 0.40),
    ("Keelkattalai Lake", 12.955, 80.195, 0.35),
    ("Perumbakkam Lake", 12.885, 80.195, 0.70),
    ("Sembakkam Lake", 12.925, 80.165, 0.50),
    ("Ennore Creek", 13.232, 80.300, 1.10),
]

# Land-use patches: (name, lat, lon, radius_km, kind, strength)
#   kind ∈ green | forest | wetland | industrial | dump | dense | paved | campus | informal | open
PATCHES = [
    ("Guindy National Park", 13.005, 80.228, 1.35, "forest", 1.0),
    ("IIT Madras", 12.991, 80.234, 1.10, "campus", 0.95),
    ("Theosophical Society", 13.012, 80.266, 0.55, "forest", 0.9),
    ("Adyar Poonga", 13.015, 80.258, 0.40, "green", 0.8),
    ("Nanmangalam Reserve Forest", 12.935, 80.165, 1.20, "forest", 0.95),
    ("Pallikaranai Marsh", 12.935, 80.215, 1.80, "wetland", 1.0),
    ("Anna Nagar Parks", 13.087, 80.212, 1.00, "green", 0.45),
    ("Madhavaram Milk Colony", 13.155, 80.232, 1.20, "green", 0.7),
    ("Officers Training Academy", 12.993, 80.189, 0.80, "campus", 0.8),
    ("Tambaram Air Force Station", 12.908, 80.128, 1.20, "campus", 0.6),
    ("Semmozhi Poonga", 13.050, 80.251, 0.25, "green", 0.6),
    ("Island Grounds", 13.076, 80.278, 0.45, "open", 0.8),
    ("Chennai Airport", 12.990, 80.170, 1.45, "paved", 1.0),
    ("Ambattur Industrial Estate", 13.098, 80.165, 1.20, "industrial", 0.95),
    ("Guindy Industrial Estate", 13.012, 80.205, 0.60, "industrial", 0.85),
    ("Manali Petrochemical Belt", 13.168, 80.265, 1.50, "industrial", 1.0),
    ("Ennore Port & Thermal", 13.220, 80.310, 1.30, "industrial", 1.0),
    ("Kodungaiyur Dump Yard", 13.135, 80.262, 0.80, "dump", 1.0),
    ("Perungudi Dump Yard", 12.955, 80.228, 0.60, "dump", 0.9),
    ("Chennai Port", 13.095, 80.293, 0.90, "paved", 0.9),
    ("Koyambedu Market", 13.069, 80.196, 0.60, "paved", 0.8),
    ("George Town", 13.092, 80.284, 1.20, "dense", 1.0),
    ("T. Nagar", 13.042, 80.234, 1.00, "dense", 0.9),
    ("Washermanpet", 13.118, 80.282, 1.10, "dense", 0.85),
    ("Triplicane", 13.058, 80.276, 0.60, "dense", 0.7),
    ("Vyasarpadi", 13.110, 80.258, 1.00, "informal", 0.9),
    ("Semmencherry", 12.866, 80.225, 0.80, "informal", 0.85),
    ("Kannagi Nagar", 12.946, 80.237, 0.60, "informal", 0.9),
    ("Pulianthope", 13.098, 80.262, 0.60, "informal", 0.8),
]

# Localities used for aggregation (name, lat, lon)
LOCALITIES = [
    ("George Town", 13.094, 80.287), ("Royapuram", 13.113, 80.294), ("Tondiarpet", 13.126, 80.288),
    ("Washermanpet", 13.118, 80.276), ("Perambur", 13.118, 80.233), ("Kolathur", 13.124, 80.212),
    ("Madhavaram", 13.148, 80.231), ("Kodungaiyur", 13.137, 80.256), ("Tiruvottiyur", 13.160, 80.300),
    ("Ennore", 13.215, 80.318), ("Manali", 13.170, 80.262), ("Puzhal", 13.160, 80.215),
    ("Red Hills", 13.192, 80.180), ("Ambattur", 13.114, 80.154), ("Padi", 13.100, 80.185),
    ("Anna Nagar", 13.085, 80.210), ("Villivakkam", 13.108, 80.207), ("Kilpauk", 13.083, 80.242),
    ("Egmore", 13.073, 80.261), ("Chepauk", 13.064, 80.281), ("Mylapore", 13.034, 80.267),
    ("Triplicane", 13.058, 80.276), ("Nungambakkam", 13.060, 80.242), ("T. Nagar", 13.042, 80.234),
    ("Kodambakkam", 13.052, 80.225), ("Vadapalani", 13.050, 80.212), ("Koyambedu", 13.070, 80.195),
    ("Ashok Nagar", 13.037, 80.212), ("K.K. Nagar", 13.040, 80.199), ("Valasaravakkam", 13.040, 80.175),
    ("Porur", 13.035, 80.158), ("Saidapet", 13.021, 80.223), ("Guindy", 13.007, 80.213),
    ("Adyar", 13.006, 80.257), ("Besant Nagar", 12.999, 80.267), ("Thiruvanmiyur", 12.983, 80.259),
    ("Velachery", 12.979, 80.218), ("Taramani", 12.985, 80.240), ("Perungudi", 12.965, 80.243),
    ("Pallikaranai", 12.935, 80.205), ("Medavakkam", 12.917, 80.192), ("Sholinganallur", 12.901, 80.227),
    ("Neelankarai", 12.949, 80.254), ("Injambakkam", 12.917, 80.247), ("Thoraipakkam", 12.940, 80.235),
    ("Madipakkam", 12.963, 80.198), ("Nanganallur", 12.981, 80.189), ("Meenambakkam", 12.986, 80.172),
    ("Pallavaram", 12.968, 80.150), ("Chromepet", 12.951, 80.141), ("Tambaram", 12.925, 80.118),
    ("Selaiyur", 12.912, 80.140), ("Alandur", 12.997, 80.201), ("Maduravoyal", 13.065, 80.168),
    ("Avadi", 13.115, 80.108), ("Mogappair", 13.084, 80.175), ("Thirumullaivoyal", 13.130, 80.130),
    ("Semmencherry", 12.866, 80.225), ("Navalur", 12.848, 80.226), ("Perumbakkam", 12.892, 80.205),
    ("Kovilambakkam", 12.940, 80.185), ("Mugalivakkam", 13.020, 80.162),
]

# Urban growth corridors: ((lat0, lon0), (lat1, lon1), width_km, weight)
CORRIDORS = [
    ((13.000, 80.200), (12.915, 80.112), 1.6, 0.55),  # GST Road
    ((12.990, 80.246), (12.840, 80.228), 1.4, 0.45),  # OMR / IT corridor
    ((13.110, 80.292), (13.205, 80.312), 1.2, 0.45),  # Tiruvottiyur High Rd
    ((13.070, 80.200), (13.050, 80.100), 1.4, 0.45),  # Poonamallee High Rd
    ((13.090, 80.200), (13.115, 80.100), 1.4, 0.50),  # Avadi / CTH Road
    ((13.090, 80.230), (13.190, 80.190), 1.3, 0.35),  # GNT Road
    ((12.990, 80.200), (12.910, 80.200), 1.2, 0.35),  # Velachery–Medavakkam
]


def grid_centres():
    """Centres of every 0.005° cell in the study bounding box (row-major, south→north)."""
    lats = np.arange(LAT_MIN + STEP / 2, LAT_MAX, STEP)
    lons = np.arange(LON_MIN + STEP / 2, LON_MAX, STEP)
    LON, LAT = np.meshgrid(lons, lats)
    return LAT.ravel(), LON.ravel()


def inside_study_area(lat, lon):
    """Organic metropolitan footprint (core city + inner suburbs), elongated N–S along the coast."""
    ex = (lon - 80.215) * KM_PER_DEG_LON
    ey = (lat - 13.04) * KM_PER_DEG_LAT
    th = np.arctan2(ey, ex)
    rmul = 1 + 0.07 * np.sin(3 * th + 1.1) + 0.05 * np.sin(5 * th + 2.3) + 0.03 * np.sin(9 * th + 0.4)
    return (ex / 13.0) ** 2 + (ey / 21.5) ** 2 < rmul ** 2


def assign_localities(lat, lon):
    names = np.array([l[0] for l in LOCALITIES])
    d = np.stack([dist_km(lat, lon, la, lo) for _, la, lo in LOCALITIES], axis=1)
    return names[d.argmin(axis=1)]


def to_km(lat, lon, lat0, lon0):
    return (lon - lon0) * KM_PER_DEG_LON, (lat - lat0) * KM_PER_DEG_LAT


def dist_km(lat, lon, lat0, lon0):
    dx, dy = to_km(lat, lon, lat0, lon0)
    return np.hypot(dx, dy)


def dist_to_polyline_km(lat, lon, pts):
    """Vectorised distance (km) from points to a polyline."""
    best = np.full(np.shape(lat), np.inf)
    for (a_lat, a_lon), (b_lat, b_lon) in zip(pts[:-1], pts[1:]):
        px, py = to_km(lat, lon, a_lat, a_lon)
        bx, by = to_km(b_lat, b_lon, a_lat, a_lon)
        seg2 = bx * bx + by * by
        t = np.clip((px * bx + py * by) / seg2, 0, 1)
        d = np.hypot(px - t * bx, py - t * by)
        best = np.minimum(best, d)
    return best
