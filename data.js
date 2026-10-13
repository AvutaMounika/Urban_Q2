/*
 * data.js
 * Values copied from the notebook CE25M401_Q2_TEST2.ipynb (cells that print
 * `ndbi_df`, `image_counts_df` and `validation_df`). Nothing here is estimated.
 *
 * Source collection : COPERNICUS/S2_SR_HARMONIZED
 * Season            : 1 January to 31 March of each year (rabi / winter)
 * Composite         : per-pixel median of cloud-masked NDBI
 * Reducer           : mean over the ward boundary at 20 m, maxPixels 1e13
 */
window.NDBI_DATA = {
  years:       [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025],
  meanNDBI:    [0.026060, 0.002591, 0.019517, 0.016802, -0.018489, 0.001792, 0.020035, 0.012397],
  imageCount:  [7, 18, 18, 19, 16, 18, 18, 19],
  validPixels: [558394, 558394, 558394, 558394, 558394, 558394, 558394, 558394],

  /* WGS84 bounds of the ward layer, printed by faridabad_gdf.total_bounds */
  bounds: { west: 77.2151809, south: 28.2962767, east: 77.362593, north: 28.5123007 },

  /* Files the map looks for. Create them with export_for_web.py (see README). */
  files: {
    wards: "wards.geojson",
    annualPattern: "ndbi_{year}.png",
    change: "ndbi_change_2018_2025.png"
  },

  /* Colour ramps copied from the notebook (ndbi_vis and difference_vis) */
  annualVis:  { min: -0.5, max: 0.5, palette: ["#313695", "#74add1", "#ffffbf", "#fdae61", "#d73027"] },
  changeVis:  { min: -0.3, max: 0.3, palette: ["#2166ac", "#f7f7f7", "#b2182b"] }
};
