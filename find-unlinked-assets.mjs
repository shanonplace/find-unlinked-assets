// unlinked-assets.mjs
import dotenv from "dotenv";
import { createClient } from "contentful";
import fs from "fs/promises";
import chalk from "chalk";

dotenv.config();

// Retrieve environment variables using your specific variable names
const { SPACE_ID, ENVIRONMENT, ACCESS_TOKEN } = process.env;

// Validate environment variables
if (!SPACE_ID || !ACCESS_TOKEN) {
  console.error(
    chalk.red.bold(
      "Missing required environment variables. Please check your .env file."
    )
  );
  process.exit(1);
}

// Initialize Contentful client
const client = createClient({
  space: SPACE_ID,
  environment: ENVIRONMENT || "master", // Default to 'master' if not specified
  accessToken: ACCESS_TOKEN,
});

// Helper function to generate Contentful Web App URL for an asset
function getContentfulWebAppUrl(spaceId, assetId, environmentId = "master") {
  return `https://app.contentful.com/spaces/${spaceId}/environments/${environmentId}/assets/${assetId}`;
}

// Function to format file size
function formatFileSize(bytes) {
  if (!bytes || isNaN(bytes)) return "Unknown";

  const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
  if (bytes === 0) return "0 Bytes";
  const i = parseInt(Math.floor(Math.log(bytes) / Math.log(1024)), 10);
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${sizes[i]}`;
}

// Find all unlinked assets
async function findUnlinkedAssets() {
  const unlinkedAssets = [];
  let skip = 0;
  const limit = 100; // Process 100 assets per API call
  let hasMoreAssets = true;

  console.log(chalk.blue.bold("⏳ Starting to scan for unlinked assets..."));

  while (hasMoreAssets) {
    try {
      // Fetch a batch of assets
      const progressMsg = `Fetching assets (skip: ${skip}, limit: ${limit})...`;
      console.log(chalk.yellow(progressMsg));

      const assetsResponse = await client.getAssets({
        skip,
        limit,
        order: "sys.createdAt",
      });

      const assets = assetsResponse.items;

      if (assets.length === 0) {
        hasMoreAssets = false;
        continue;
      }

      // Process each asset to check if it's linked
      for (const asset of assets) {
        const assetId = asset.sys.id;

        // Check if any entries link to this asset
        const linkedEntries = await client.getEntries({
          links_to_asset: assetId,
          limit: 1, // We only need to know if at least one entry links to the asset
        });

        // If no entries link to this asset, add it to our list
        if (linkedEntries.total === 0) {
          const assetTitle =
            asset.fields.title?.["en-US"] || asset.fields.title || "Untitled";
          const contentfulUrl = getContentfulWebAppUrl(
            SPACE_ID,
            assetId,
            ENVIRONMENT || "master"
          );

          // Get file details if available
          const fileDetails = asset.fields.file?.["en-US"] || asset.fields.file;
          const fileSize = fileDetails?.details?.size;

          unlinkedAssets.push({
            id: assetId,
            title: assetTitle,
            url: fileDetails?.url || "No URL",
            contentType: fileDetails?.contentType || "Unknown",
            fileSize: fileSize ? formatFileSize(fileSize) : "Unknown",
            createdAt: new Date(asset.sys.createdAt).toLocaleDateString(),
            updatedAt: new Date(asset.sys.updatedAt).toLocaleDateString(),
            contentfulUrl: contentfulUrl,
          });

          // Update user on progress
          console.log(
            chalk.green(
              `✓ Found unlinked asset: ${chalk.white.bold(assetTitle)}`
            )
          );
        }
      }

      // Prepare for the next batch
      skip += limit;

      // If we've processed all assets, exit the loop
      if (assets.length < limit) {
        hasMoreAssets = false;
      }
    } catch (error) {
      console.error(
        chalk.red.bold("Error fetching or processing assets:"),
        error.message
      );
      hasMoreAssets = false; // Stop processing on error
    }
  }

  return unlinkedAssets;
}

// Main execution function
async function main() {
  try {
    console.log(
      chalk.cyan.bold("🔍 Searching for unlinked assets in Contentful space...")
    );
    console.log(chalk.gray(`Space ID: ${SPACE_ID}`));
    console.log(chalk.gray(`Environment: ${ENVIRONMENT || "master"}`));
    console.log();

    const unlinkedAssets = await findUnlinkedAssets();

    // Generate a report
    const timestamp = new Date()
      .toISOString()
      .replace(/:/g, "-")
      .replace(/\..+/, "");
    const filename = `unlinked-assets-${timestamp}.json`;

    await fs.writeFile(filename, JSON.stringify(unlinkedAssets, null, 2));

    console.log();
    console.log(
      chalk.green.bold(
        `✅ Found ${chalk.white(unlinkedAssets.length)} unlinked assets.`
      )
    );
    console.log(
      chalk.green.bold(`💾 Report saved to ${chalk.white(filename)}`)
    );
    console.log();

    // Print a summary with clickable links in list format
    if (unlinkedAssets.length > 0) {
      console.log(chalk.cyan.bold("📋 Unlinked Assets Summary:"));
      console.log(chalk.gray("─".repeat(80)));

      unlinkedAssets.forEach((asset, index) => {
        console.log(chalk.white.bold(`${index + 1}. ${asset.title}`));
        console.log(chalk.gray(`   ID: ${asset.id}`));
        console.log(chalk.gray(`   Type: ${asset.contentType}`));
        console.log(chalk.gray(`   Size: ${asset.fileSize}`));
        console.log(chalk.gray(`   Created: ${asset.createdAt}`));
        console.log(chalk.blue.underline(`   URL: ${asset.contentfulUrl}`));

        // Add separator between items
        if (index < unlinkedAssets.length - 1) {
          console.log(chalk.gray("─".repeat(80)));
        }
      });

      console.log(chalk.gray("─".repeat(80)));
      console.log();
      console.log(
        chalk.gray("Note: Click on the URLs to open assets in Contentful")
      );
    } else {
      console.log(
        chalk.green(
          "👍 No unlinked assets found. Your content is well-organized!"
        )
      );
    }
  } catch (error) {
    console.error(chalk.red.bold("❌ Error running the script:"), error);
    process.exit(1);
  }
}

main();
