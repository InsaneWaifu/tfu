import { render } from "preact";
import { useMemo, useState } from "preact/hooks";
import Handlebars from "handlebars";
import templates from "./build/templates.json" with { type: "json" };
import people from "./build/people.json" with { type: "json" };
import "preact/jsx-runtime";
import * as marked from "marked";
// deno-lint-ignore no-unused-vars
import { Fragment, h } from "preact";

Handlebars.registerHelper("eq", function (arg1, arg2) {
  return arg1 === arg2;
});

Handlebars.registerHelper("neq", function (arg1, arg2) {
  return arg1 !== arg2;
});

Handlebars.registerHelper("and", function (...args) {
  return args.slice(0, -1).every(Boolean);
});

Handlebars.registerHelper("nand", function (...args) {
  return !args.slice(0, -1).every(Boolean);
});

Handlebars.registerHelper("or", function (...args) {
  return args.slice(0, -1).some(Boolean);
});

Handlebars.registerHelper("concat", function () {
  return Array.from(arguments).slice(0, -1).join("");
});

Handlebars.registerPartial(
  "header",
  `
<p style="text-align: center;">
<img src="https://plpd.online/images/swat.png" style="display: block; margin: 0 auto;" width="164" height="164"/><br/>
<b>{{title}}</b><br/>
<b>{{department}}</b>
</p>
`,
);

function SenderField({ node, formData, onChange }) {
  const name = node.values[0];
  const label = node.properties.label || name;
  const selectedHandle = formData[name] || "";

  function handleChange(e) {
    const handle = e.target.value;
    onChange(name, handle);

    if (handle && people[handle]) {
      onChange("sender_rank", people[handle].rank);
      onChange("sender_name", people[handle].rp);
      onChange("sender_role", people[handle].role);
    } else {
      onChange("sender_rank", "");
      onChange("sender_name", "");
      onChange("sender_role", "");
    }
  }

  return (
    <div className="field-container">
      <label>{label}</label>
      <select name={name} value={selectedHandle} onChange={handleChange}>
        <option value="">-- Select a person --</option>
        {Object.values(people).map((p) => (
          <option key={p.name} value={p.name}>{p.name}</option>
        ))}
      </select>
    </div>
  );
}

function Field({ node, formData, onChange }) {
  const name = node.values[0];

  if (node.properties.sender === "yes") {
    return <SenderField node={node} formData={formData} onChange={onChange} />;
  }

  if (node.children.length > 0) {
    return (
      <div className="field-container">
        <label>{node.properties.label || name}</label>
        <select
          name={name}
          value={formData[name] || ""}
          onChange={(e) => onChange(name, e.target.value)}
        >
          <option value="">-- Select an option --</option>
          {node.children.map((v) => (
            <option key={v.name} value={v.name}>{v.name}</option>
          ))}
        </select>
      </div>
    );
  }

  if (node.properties.multiline === "yes") {
    return (
      <div className="field-container">
        <label>{node.properties.label || name}</label>
        <textarea
          id="input-text"
          name={name}
          value={formData[name] || ""}
          onInput={(e) => onChange(name, e.target.value)}
        />
      </div>
    );
  } else {
    return (
      <div className="field-container">
        <label>{node.properties.label || name}</label>
        <input
          type="text"
          name={name}
          value={formData[name] || ""}
          onInput={(e) => onChange(name, e.target.value)}
        />
      </div>
    );
  }
}

function RenderNode({ node, formData, onChange }) {
  if (node.name === "field") {
    return <Field node={node} formData={formData} onChange={onChange} />;
  }

  if (node.name === "showIf") {
    const shouldShow = Object.entries(node.properties || {}).every(
      ([k, v]) => formData[k] === v,
    );

    if (!shouldShow) return null;

    return node.children.map((child, i) => (
      <RenderNode
        key={i}
        node={child}
        formData={formData}
        onChange={onChange}
      />
    ));
  }

  return null;
}

function App() {
  const [formData, setFormData] = useState({});
  const [selectedTemplate, setSelectedTemplate] = useState(
    Object.keys(templates)[0],
  );
  const schema = useMemo(() => templates[selectedTemplate].schema, [
    selectedTemplate,
  ]);
  const formIsFilled = useMemo(() => {
    const requiredFields = [];
    function findRequiredFields(node) {
      if (node.name === "field") {
        requiredFields.push(node.values[0]);
      } else if (node.name === "showIf") {
        const shouldShow = Object.entries(node.properties || {}).every(
          ([k, v]) => formData[k] === v,
        );
        if (shouldShow) {
          node.children.forEach(findRequiredFields);
        }
      }
    }
    schema.output.forEach(findRequiredFields);
    return requiredFields.every((field) => formData[field]);
  }, [schema, formData]);

  const renderedOutput = useMemo(() => {
    const template = Handlebars.compile(templates[selectedTemplate].content);
    const rendered = template(formData, { noEscape: true });
    const out = marked.parse(rendered);
    console.log(out);
    return {
      html:
        '<meta http-equiv="content-type" content="text/html; charset=utf-8">' +
        out,
      md: rendered,
    };
  }, [formData, selectedTemplate, formIsFilled]);

  function onChange(name, value) {
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  async function copyRichText() {
    if (!navigator.clipboard) {
      alert("Clipboard API not supported");
      return;
    }

    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([renderedOutput.html], { type: "text/html" }),
          "text/plain": new Blob([renderedOutput.md], { type: "text/plain" }),
        }),
      ]);
      alert("Rendered output copied to clipboard!");
    } catch (err) {
      console.error("Failed to copy: ", err);
      alert("Failed to copy rendered output.");
    }
  }

  return (
    // schema selector, then form, then rendered output
    <div id="app-container">
      <div id="app-header">
        <div id="template-selector">
          <label htmlFor="template-select">Select template:</label>
          <select
            id="template-select"
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value)}
          >
            {Object.keys(templates).map((templateName) => (
              <option key={templateName} value={templateName}>
                {templateName}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div id="app-body">
        <div id="form-container">
          <h2>Form</h2>
          {!formIsFilled && (
            <p style={{ color: "red" }}>Form is not entirely filled.</p>
          )}

          {schema.output.map((node, i) => (
            <RenderNode
              key={i}
              node={node}
              formData={formData}
              onChange={onChange}
            />
          ))}
        </div>

        <div id="output-container">
          <div id="buttons-container">
            <button onClick={copyRichText}>
              Copy Rendered Output
            </button>
          </div>
          <div id="rendered-output">
            <div dangerouslySetInnerHTML={{ __html: renderedOutput.html }} />
          </div>
        </div>
      </div>
    </div>
  );
}
render(<App />, document.getElementById("react-body"));

