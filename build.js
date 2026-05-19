import { parse } from "kdljs";
import { exists } from "std/fs/exists";
import * as esbuild from "esbuild";
import { htmlPlugin } from "@craftamap/esbuild-plugin-html";
import { denoPlugins } from "@luca/esbuild-deno-loader";

async function runBuild() {
  try {
    const result = {};

    for await (const entry of Deno.readDir("./templates")) {
      if (!entry.isDirectory) continue;

      const name = entry.name;
      const base = `templates/${name}`;

      const schemaRaw = await Deno.readTextFile(`${base}/schema`);
      const content = await Deno.readTextFile(`${base}/content`);

      result[name] = {
        content,
        schema: parse(schemaRaw),
      };
    }

    await Deno.mkdir("./build/dist", { recursive: true });
    await Deno.writeTextFile(
      "./build/templates.json",
      JSON.stringify(result, null, 2),
    );

    const bundled = await esbuild.build({
      entryPoints: ["./index.jsx"],
      bundle: true,
      metafile: true,
      outdir: "./build/dist",
      plugins: [
        htmlPlugin({
          files: [
            {
              entryPoints: ["index.jsx"],
              filename: "index.html",
              htmlTemplate: await Deno.readTextFile("index.html"),
            },
          ],
        }),
        ...denoPlugins(),
      ],
      jsxFactory: "h",
      jsxFragment: "Fragment",
    });
    Deno.copyFile("./index.css", "build/dist/index.css");
    console.log("Build finished");
    return true;
  } catch (err) {
    console.error(err);
    return false;
  }
}

async function fetchApiData() {
  const c = new AbortController();
  const id = setTimeout(() => c.abort(), 8000);

  try {
    const res = await fetch("https://api.a1larsen.de/api/v2/tfu/hierarchy", {
      headers: {
        "user-agent": "curl/8.20.0",
        "accept": "application/json",
      },
      signal: c.signal,
    });
    clearTimeout(id);

    const data = await res.json();
    const people = Object.fromEntries(data.map((p) => {
      return [p.nick, {
        name: p.nick,
        rp: p.rpName,
        rank: p.displayName,
        role: p.role,
      }];
    }));

    await Deno.mkdir("./build", { recursive: true });
    await Deno.writeTextFile(
      "./build/people.json",
      JSON.stringify(people, null, 2),
    );
    return true;
  } catch (err) {
    console.error("API fetch failed");
    console.error(err);
    return false;
  }
}

const apiSuccess = await fetchApiData();
if (!apiSuccess && !exists("build/people.json")) {
  Deno.exit(1);
}
const buildSuccess = await runBuild();

if (Deno.args.includes("--watch")) {
  console.log("Watching");

  const watcher = Deno.watchFs([
    "./templates",
    "./index.jsx",
    "./index.html",
    "./index.css",
  ]);

  let timer = null;
  for await (const event of watcher) {
    if (
      event.kind === "modify" || event.kind === "create" ||
      event.kind === "remove"
    ) {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        console.log("Rebuilding...");
        await runBuild();
      }, 100);
    }
  }
} else {
  Deno.exit(buildSuccess ? 0 : 1);
}
