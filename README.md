# Faridabad NDBI, 2018-2025

Static website for the CE25M401 notebook (`CE25M401_Q2_TEST2.ipynb`): Normalized Difference
Built-up Index from Sentinel-2 over the 40 Faridabad wards, January to March composites,
with a trend test, discussion and limitations.

## Files

```
index.html                  page content (method, proofs, discussion, limitations)
css/style.css               styling (light and dark mode)
js/data.js                  the 8 annual values copied from the notebook
js/stats.js                 OLS, Sen slope, exact Kendall test, leave-one-out
js/main.js                  tables, SVG charts, Leaflet map
export_for_web.py           makes the map rasters and ward GeoJSON from Earth Engine
data/mean_ndbi_2018_2025.csv
data/wards.geojson          created by export_for_web.py
data/ndbi_2018.png ...      created by export_for_web.py
data/ndbi_change_2018_2025.png
```

The page works without the PNG and GeoJSON files: charts, tables and statistics render from
`js/data.js`, and the map shows a message saying which file is missing.

## 1. Create the map files (once)

```bash
pip install earthengine-api geopandas shapely requests pandas
earthengine authenticate
python export_for_web.py --project YOUR_GEE_PROJECT --wards "C:\path\to\Faridabad_wards2.geojson"
```

This writes `data/wards.geojson`, `data/ndbi_YYYY.png` for 2018-2025 and
`data/ndbi_change_2018_2025.png`. It also prints each recomputed annual mean next to the value in
`js/data.js` and flags any difference.

## 2. Test locally

Browsers block `fetch` on `file://`, so serve the folder:

```bash
python -m http.server 8000
# open http://localhost:8000
```

## 3. Publish on GitHub Pages

```bash
git init
git add .
git commit -m "Faridabad NDBI website"
git branch -M main
git remote add origin https://github.com/<your-user>/<repo>.git
git push -u origin main
```

On GitHub: Settings, Pages, Source "Deploy from a branch", branch `main`, folder `/ (root)`.
The site appears at `https://<your-user>.github.io/<repo>/` after a minute or two.

## Check the statistics independently

```bash
node -e "const S=require('./js/stats.js');const y=[0.026060,0.002591,0.019517,0.016802,-0.018489,0.001792,0.020035,0.012397];console.log(S.ols([2018,2019,2020,2021,2022,2023,2024,2025],y))"
```

Expected: slope -0.0011534, standard error 0.0023394, t = -0.493, p = 0.640, R squared = 0.039.

## Notes before you push

- Do not commit Earth Engine credentials. They live in your user profile, not in this folder.
- Keep an untouched copy of `Faridabad_wards2.geojson`; the notebook overwrites its own input file.
- Replace the course line in `index.html` and add your name and institution if required.
- Base maps use OpenStreetMap and Esri tiles; keep the attribution text in the footer and on the map.
- If you add results (for example ward-level statistics), update `js/data.js` and the Discussion text together.
