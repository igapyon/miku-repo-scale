const pattern = /https?:\/\//;
const label = "😀"; // JavaScript line comment
const view = <div data-note="/* JSX text, not a comment */">
  {`value ${42 /* template expression comment */}`}
</div>;
