# The Geography Chain

A static, browser-based version of the two supplied Python geography games. It is designed for GitHub Pages and uses only HTML, CSS, and vanilla JavaScript.

## Project structure

```text
geography-chain-website/
├── index.html
├── css/
│   └── style.css
├── js/
│   └── app.js
├── data/
│   ├── uscities.csv       # Add this file
│   └── worldcities.csv    # Add this file
└── README.md
```

## Add your datasets

The CSV files were not included with the two Python scripts you supplied, so add your own copies:

- `uscities.csv` — SimpleMaps U.S. Cities Database, placed in `data/`
- `worldcities.csv` — SimpleMaps World Cities Database, placed in `data/`

The filenames and folder are case-sensitive on GitHub Pages. Keep the original CSV headers intact. The website expects the same columns as the Python programs:

**U.S. CSV:** `city`, `city_ascii`, `state_id`, `state_name`, `lat`, `lng`, `population`

**World CSV:** `city`, `city_ascii`, `lat`, `lng`, `country`, `iso2`, `population`, `admin_name`; `city_alt` is optional.

The browser reads the datasets directly. No conversion or database service is needed.

## Run locally

A local web server is needed because browsers restrict `fetch()` when a page is opened directly from the filesystem.

1. Open this folder in Visual Studio Code.
2. Install the **Live Server** extension.
3. Right-click `index.html` and select **Open with Live Server**.
4. Choose either game on the home page.

## Publish with GitHub Pages

1. Create a public GitHub repository (for example, `geography-chain`).
2. Upload the contents of this folder to the repository root. Do not upload the enclosing folder as an extra nested directory.
3. Add both CSV files to the `data/` folder.
4. In the repository, open **Settings → Pages**.
5. Under **Build and deployment**, select **Deploy from a branch**.
6. Select branch `main` and folder `/ (root)`, then save.
7. Wait for deployment. GitHub will display the public URL in the Pages settings.

## Game rules preserved

- Five rounds: latitude guess, latitude city guess, longitude guess, longitude city guess, latitude guess.
- Each city guess becomes the city used for the next coordinate round.
- Errors are absolute coordinate differences, rounded to two decimal places.
- The final score is the sum of the five round errors; lower is better.
- U.S. starting city population must be strictly greater than 1,000,000.
- International starting city population must be strictly greater than 10,000,000, matching the uploaded international Python script.
- U.S. city answers use `City, ST`.
- International city answers use `City, Full Country Name`. If multiple matches exist in the same country, the player selects the matching region.

## Dataset attribution

The website includes a persistent “Data sourced from…” section linking to the SimpleMaps U.S. Cities and World Cities datasets. Keep that attribution visible when publishing, and follow the current dataset licensing and attribution requirements published by SimpleMaps.

## Notes

- The datasets are public files once the website is published. Do not place private data or secrets in the repository.
- The CSV files are intentionally not bundled in this project because they were not among the uploaded files.
- No externally sourced images, external JavaScript libraries, API keys, or backend services are used.
