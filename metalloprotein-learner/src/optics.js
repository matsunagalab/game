// The look of the whole game comes from one formula: light between crossed polarizers.
// A crystal that delays one polarization by g nanometres passes sin²(πg/λ) of each wavelength.
export const OPTICS_GLSL = /* glsl */ `
vec3 birefringence(float g) {
  float k = 3.14159265 * g;
  float a = sin(k / 650.0), b = sin(k / 610.0), c = sin(k / 570.0);
  float d = sin(k / 530.0), e = sin(k / 490.0), f = sin(k / 450.0);
  a *= a; b *= b; c *= c; d *= d; e *= e; f *= f;
  return vec3(
    0.43 * a + 0.39 * b + 0.15 * c + 0.03 * f,
    0.11 * b + 0.35 * c + 0.41 * d + 0.13 * e,
    0.03 * d + 0.41 * e + 0.56 * f
  );
}
`;
