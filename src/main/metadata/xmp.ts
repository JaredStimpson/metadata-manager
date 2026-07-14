import fs from 'node:fs/promises';
import path from 'node:path';
import { MetadataFields, emptyMetadata } from '../../shared/types';
import { normalizeMetadata } from './merge';

export async function readXmpSidecar(filePath: string): Promise<MetadataFields | undefined> {
  try {
    const xml = await fs.readFile(filePath, 'utf8');
    return parseXmp(xml);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENOENT') return undefined;
    throw error;
  }
}

export async function writeXmpSidecar(filePath: string, metadata: MetadataFields): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, buildXmp(metadata), 'utf8');
}

export async function removeXmpSidecar(filePath: string): Promise<void> {
  try {
    await fs.unlink(filePath);
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ENOENT') throw error;
  }
}

export function buildXmp(metadata: MetadataFields): string {
  const clean = normalizeMetadata(metadata);
  const description = clean.description ? xmpAlt('dc:description', clean.description) : '';
  const imageDescription = clean.description ? tag('tiff:ImageDescription', clean.description) : '';
  const rating = clean.rating !== undefined ? tag('xmp:Rating', String(clean.rating)) : '';
  const dateTime = clean.dateTimeOriginal ? formatDateTime(clean.dateTimeOriginal) : undefined;
  const dateFields = dateTime
    ? `${tag('exif:DateTimeOriginal', dateTime)}\n   ${tag('photoshop:DateCreated', dateTime)}`
    : '';
  const gps = gpsFields(clean);
  const tags = tagFields(clean.tags);

  return `<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>
<x:xmpmeta xmlns:x="adobe:ns:meta/">
 <rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">
  <rdf:Description rdf:about=""
   xmlns:dc="http://purl.org/dc/elements/1.1/"
   xmlns:xmp="http://ns.adobe.com/xap/1.0/"
   xmlns:exif="http://ns.adobe.com/exif/1.0/"
   xmlns:tiff="http://ns.adobe.com/tiff/1.0/"
   xmlns:photoshop="http://ns.adobe.com/photoshop/1.0/"
   xmlns:digiKam="http://www.digikam.org/ns/1.0/"
   xmlns:lr="http://ns.adobe.com/lightroom/1.0/">
   ${[description, imageDescription, rating, dateFields, gps, tags].filter(Boolean).join('\n   ')}
  </rdf:Description>
 </rdf:RDF>
</x:xmpmeta>
<?xpacket end="w"?>`;
}

export function parseXmp(xml: string): MetadataFields {
  const description =
    firstXmlValue(xml, 'dc:description') ??
    firstXmlValue(xml, 'tiff:ImageDescription');
  const rating = toNumber(firstXmlValue(xml, 'xmp:Rating'));
  const dateTimeOriginal =
    firstXmlValue(xml, 'exif:DateTimeOriginal') ??
    firstXmlValue(xml, 'photoshop:DateCreated') ??
    firstXmlValue(xml, 'xmp:CreateDate');
  const latitude = parseGps(firstXmlValue(xml, 'exif:GPSLatitude'));
  const longitude = parseGps(firstXmlValue(xml, 'exif:GPSLongitude'));
  const tags = parseTags(xml);

  return normalizeMetadata({
    description,
    rating,
    dateTimeOriginal,
    latitude,
    longitude,
    tags
  });
}

function xmpAlt(name: string, value: string): string {
  return `<${name}><rdf:Alt><rdf:li xml:lang="x-default">${escapeXml(value)}</rdf:li></rdf:Alt></${name}>`;
}

function tag(name: string, value: string): string {
  return `<${name}>${escapeXml(value)}</${name}>`;
}

function tagFields(tags: string[]): string {
  if (tags.length === 0) return '';
  const list = tags.map((item) => `<rdf:li>${escapeXml(item)}</rdf:li>`).join('');
  return [
    `<digiKam:TagsList><rdf:Seq>${list}</rdf:Seq></digiKam:TagsList>`,
    `<lr:HierarchicalSubject><rdf:Bag>${list}</rdf:Bag></lr:HierarchicalSubject>`,
    `<dc:subject><rdf:Bag>${list}</rdf:Bag></dc:subject>`
  ].join('\n   ');
}

function gpsFields(metadata: MetadataFields): string {
  if (metadata.latitude === undefined || metadata.longitude === undefined) return '';
  return [
    tag('exif:GPSLatitude', decimalToXmpGps(metadata.latitude, 'lat')),
    tag('exif:GPSLongitude', decimalToXmpGps(metadata.longitude, 'lng'))
  ].join('\n   ');
}

export function decimalToXmpGps(value: number, axis: 'lat' | 'lng'): string {
  const direction = axis === 'lat' ? (value < 0 ? 'S' : 'N') : value < 0 ? 'W' : 'E';
  const absolute = Math.abs(value);
  const degrees = Math.floor(absolute);
  const minutes = (absolute - degrees) * 60;
  return `${degrees},${minutes.toFixed(6)}${direction}`;
}

export function parseGps(value?: string): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  const decimal = Number(trimmed);
  if (!Number.isNaN(decimal)) return decimal;

  const match = trimmed.match(/^(\d+(?:\.\d+)?),(\d+(?:\.\d+)?)([NSEW])$/i);
  if (!match) return undefined;
  const degrees = Number(match[1]);
  const minutes = Number(match[2]);
  const direction = match[3].toUpperCase();
  const sign = direction === 'S' || direction === 'W' ? -1 : 1;
  return Number(((degrees + minutes / 60) * sign).toFixed(7));
}

function formatDateTime(value: string): string {
  const trimmed = value.trim();
  if (/^\d{4}:\d{2}:\d{2}/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return trimmed;
  const pad = (input: number) => String(input).padStart(2, '0');
  return `${parsed.getFullYear()}:${pad(parsed.getMonth() + 1)}:${pad(parsed.getDate())} ${pad(
    parsed.getHours()
  )}:${pad(parsed.getMinutes())}:${pad(parsed.getSeconds())}`;
}

function firstXmlValue(xml: string, tagName: string): string | undefined {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = xml.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)</${escaped}>`, 'i'));
  if (!match) return undefined;
  const withoutChildren = match[1].replace(/<[^>]+>/g, '').trim();
  return unescapeXml(withoutChildren) || undefined;
}

function parseTags(xml: string): string[] {
  const chunks = [
    innerXml(xml, 'digiKam:TagsList'),
    innerXml(xml, 'lr:HierarchicalSubject'),
    innerXml(xml, 'dc:subject')
  ].filter(Boolean) as string[];
  const tags = chunks.flatMap((chunk) =>
    Array.from(chunk.matchAll(/<rdf:li(?:\s[^>]*)?>([\s\S]*?)<\/rdf:li>/gi)).map((match) =>
      unescapeXml(match[1].replace(/<[^>]+>/g, '').trim())
    )
  );
  return [...new Set(tags.map((tag) => tag.trim()).filter(Boolean))];
}

function innerXml(xml: string, tagName: string): string | undefined {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = xml.match(new RegExp(`<${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)</${escaped}>`, 'i'));
  return match?.[1];
}

function toNumber(value?: string): number | undefined {
  if (!value) return undefined;
  const number = Number(value);
  return Number.isNaN(number) ? undefined : number;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function unescapeXml(value: string): string {
  return value
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

export function metadataFromUnknown(value: unknown): MetadataFields {
  if (!value || typeof value !== 'object') return emptyMetadata();
  const source = value as Record<string, unknown>;
  return normalizeMetadata({
    description: asString(source.description),
    rating: asNumber(source.rating),
    dateTimeOriginal: asString(source.dateTimeOriginal),
    latitude: asNumber(source.latitude),
    longitude: asNumber(source.longitude),
    tags: Array.isArray(source.tags) ? source.tags.map(String) : []
  });
}

function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' ? value : undefined;
}
