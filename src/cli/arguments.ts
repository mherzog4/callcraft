export function argumentValue(name: string, args = process.argv): string | undefined {
  const direct = args.find((value) => value.startsWith(`${name}=`));
  if (direct) return direct.slice(name.length + 1);
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

export function argumentValues(name: string, args = process.argv): string[] {
  const direct = argumentValue(name, args);
  if (direct && args.some((value) => value.startsWith(`${name}=`))) {
    return direct.split(",").filter(Boolean);
  }
  const index = args.indexOf(name);
  if (index < 0) return [];
  const values: string[] = [];
  for (let cursor = index + 1; cursor < args.length; cursor += 1) {
    const value = args[cursor];
    if (!value || value.startsWith("--")) break;
    values.push(...value.split(",").filter(Boolean));
  }
  return values;
}
