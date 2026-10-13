#!/usr/bin/env python3
"""
export_for_web.py

Creates the files that index.html loads from the data/ folder:

    data/wards.geojson                 ward polygons (EPSG:4326, 2D, Ward_No only)
    data/ndbi_2018.png ... ndbi_2025.png   annual NDBI composites, transparent outside the wards
    data/ndbi_change_2018_2025.png     2025 minus 2018 difference
    data/mean_ndbi_2018_2025.csv       annual means recomputed from Earth Engine

The compositing code is the same as in CE25M401_Q2_TEST2.ipynb (same collection, SCL mask,
median composite, 20 m mean), so the recomputed means can be compared with js/data.js.

Usage (from the repository root):

    pip install earthengine-api geopandas shapely requests pandas
    earthengine authenticate            # once
    python export_for_web.py --project YOUR_GEE_PROJECT --wards path/to/Faridabad_wards2.geojson

Pixel size of the PNGs is about 17 m (1400 px along the longer side). Change --size to alter it.
"""

import argparse
import os
import sys

import ee
import geopandas as gpd
import pandas as pd
import requests
from shapely.geometry import mapping

YEARS = list(range(2018, 2026))

ANNUAL_VIS = {"min": -0.5, "max": 0.5,
              "palette": ["313695", "74add1", "ffffbf", "fdae61", "d73027"]}
CHANGE_VIS = {"min": -0.3, "max": 0.3,
              "palette": ["2166ac", "f7f7f7", "b2182b"]}

# Values published in js/data.js (from the notebook), used for a consistency check.
PUBLISHED = {2018: 0.026060, 2019: 0.002591, 2020: 0.019517, 2021: 0.016802,
             2022: -0.018489, 2023: 0.001792, 2024: 0.020035, 2025: 0.012397}


def load_wards(path):
    gdf = gpd.read_file(path)
    gdf = gdf[gdf.geometry.notna() & ~gdf.geometry.is_empty].copy()
    gdf = gdf.to_crs("EPSG:4326")
    gdf["geometry"] = gdf.geometry.make_valid().force_2d()
    return gdf


def build_ee_wards(gdf):
    feats = []
    for _, row in gdf.iterrows():
        geom = row.geometry.simplify(0.000001, preserve_topology=True)
        props = {str(k): (None if v is None else str(v))
                 for k, v in row.drop(labels="geometry").items()}
        feats.append(ee.Feature(ee.Geometry(mapping(geom)), props))
    return ee.FeatureCollection(feats)


def calculate_ndbi(image):
    scl = image.select("SCL")
    clear = (scl.neq(0).And(scl.neq(1)).And(scl.neq(3)).And(scl.neq(7))
             .And(scl.neq(8)).And(scl.neq(9)).And(scl.neq(10)).And(scl.neq(11)))
    nir = image.select("B8").multiply(0.0001)
    swir1 = image.select("B11").multiply(0.0001)
    denom = swir1.add(nir)
    ndbi = (swir1.subtract(nir).divide(denom)
            .updateMask(denom.abs().gt(0.000001)).rename("NDBI"))
    return ndbi.updateMask(clear).copyProperties(image, ["system:time_start"])


def annual_composite(s2, region, year):
    col = (s2.filterBounds(region)
             .filterDate(f"{year}-01-01", f"{year}-04-01"))
    return col.map(calculate_ndbi).median().clip(region).set("year", year), col.size()


def download_png(image, vis, region_rect, size, path):
    url = image.visualize(**vis).getThumbURL({
        "region": region_rect,
        "dimensions": size,
        "format": "png",
        "crs": "EPSG:4326",
    })
    r = requests.get(url, timeout=300)
    r.raise_for_status()
    with open(path, "wb") as f:
        f.write(r.content)
    print(f"  wrote {path} ({len(r.content) / 1024:.0f} KB)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--project", required=True, help="Google Cloud / Earth Engine project id")
    ap.add_argument("--wards", required=True, help="path to Faridabad_wards2.geojson")
    ap.add_argument("--out", default="data", help="output folder (default: data)")
    ap.add_argument("--size", type=int, default=1400, help="PNG size in pixels along the longer side")
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    ee.Initialize(project=args.project)

    gdf = load_wards(args.wards)

    # Ward GeoJSON for the web map: keep only the ward number, 6-decimal coordinates.
    web = gdf[["Ward_No", "geometry"]].copy()
    web["Ward_No"] = web["Ward_No"].astype(str)
    wards_path = os.path.join(args.out, "wards.geojson")
    web.to_file(wards_path, driver="GeoJSON", COORDINATE_PRECISION=6)
    print(f"wrote {wards_path}")

    wards = build_ee_wards(gdf)
    region = wards.geometry()
    w, s, e, n = gdf.total_bounds
    rect = ee.Geometry.Rectangle([w, s, e, n], proj="EPSG:4326", geodesic=False)
    print(f"bounds: west={w:.7f} south={s:.7f} east={e:.7f} north={n:.7f}")

    s2 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    composites, rows = {}, []
    for year in YEARS:
        img, count = annual_composite(s2, region, year)
        composites[year] = img
        stats = img.select("NDBI").reduceRegion(
            reducer=ee.Reducer.mean().combine(ee.Reducer.count(), sharedInputs=True),
            geometry=region, scale=20, maxPixels=1e13, tileScale=4).getInfo()
        rows.append({"Year": year,
                     "Mean_NDBI": stats["NDBI_mean"],
                     "Image_count": count.getInfo(),
                     "Valid_pixel_count": stats["NDBI_count"]})
        diff = abs(stats["NDBI_mean"] - PUBLISHED[year])
        flag = "ok" if diff < 5e-6 else "DIFFERS from js/data.js"
        print(f"{year}: mean={stats['NDBI_mean']:.6f}  images={rows[-1]['Image_count']}  [{flag}]")

        download_png(img.select("NDBI"), ANNUAL_VIS, rect, args.size,
                     os.path.join(args.out, f"ndbi_{year}.png"))

    pd.DataFrame(rows).to_csv(os.path.join(args.out, "mean_ndbi_2018_2025.csv"), index=False)

    change = composites[2025].select("NDBI").subtract(composites[2018].select("NDBI")).rename("NDBI_change")
    download_png(change, CHANGE_VIS, rect, args.size,
                 os.path.join(args.out, "ndbi_change_2018_2025.png"))

    print("done. Commit the data/ folder and push.")


if __name__ == "__main__":
    sys.exit(main())
