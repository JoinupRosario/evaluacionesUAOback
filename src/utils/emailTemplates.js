import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Obtiene la URL del logo para usar en correos
 * @returns {string} - URL del logo
 */
export const getLogoUrl = () => {
  // Usar la URL externa del logo en lugar de base64
  return 'https://avasalud-1.s3.us-east-1.amazonaws.com/clinics/patients/undefined/header-P3vrLVaL.png';
};

/**
 * Carga una plantilla de correo desde el sistema de archivos
 * @param {string} templateName - Nombre de la plantilla (sin extensión)
 * @param {string} category - Categoría de la plantilla (ej: 'practicas')
 * @returns {string} - Contenido HTML de la plantilla
 */
export const loadEmailTemplate = (templateName, category = 'practicas') => {
  try {
    const templatePath = path.join(__dirname, '../templates', category, `${templateName}.html`);
    
    if (!fs.existsSync(templatePath)) {
      throw new Error(`Plantilla no encontrada: ${templatePath}`);
    }
    
    return fs.readFileSync(templatePath, 'utf8');
  } catch (error) {
    console.error(`Error al cargar plantilla ${templateName}:`, error);
    throw error;
  }
};

/**
 * Reemplaza las variables en una plantilla con los valores proporcionados
 * @param {string} template - Contenido HTML de la plantilla
 * @param {Object} variables - Objeto con las variables a reemplazar
 * @param {string} logoUrl - URL del logo (opcional, se reemplaza {{LOGO_URL}})
 * @returns {string} - Plantilla con variables reemplazadas
 */
export const renderEmailTemplate = (template, variables = {}, logoUrl = null) => {
  let rendered = template;
  
  // Reemplazar logo si se proporciona
  if (logoUrl) {
    // Asegurar que la URL del logo esté correctamente formateada
    const cleanLogoUrl = logoUrl.trim();
    rendered = rendered.replace(/\{\{LOGO_URL\}\}/g, cleanLogoUrl);
  } else {
    console.warn('⚠️  No se proporcionó logoUrl, removiendo imagen del logo');
    // Si no hay logo, usar un placeholder o remover la imagen
    rendered = rendered.replace(/<img[^>]*\{\{LOGO_URL\}\}[^>]*>/g, '');
  }
  
  // Reemplazar todas las demás variables
  Object.keys(variables).forEach(key => {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    rendered = rendered.replace(regex, variables[key] || '');
  });
  
  return rendered;
};

/**
 * Obtiene la plantilla de correo para un tipo de actor específico
 * @param {string} actorType - Tipo de actor: 'student', 'boss', 'monitor'
 * @param {Object} variables - Variables a reemplazar en la plantilla
 * @param {string} logoUrl - URL del logo (opcional, si no se proporciona usa el logo del backend)
 * @returns {string} - HTML renderizado de la plantilla
 */
export const getEmailTemplate = (actorType, variables = {}, logoUrl = null) => {
  let templateName;
  
  switch (actorType) {
    case 'student':
      templateName = 'estudiante-practicas';
      break;
    case 'boss':
      templateName = 'tutor-practicas';
      break;
    case 'monitor':
      templateName = 'monitor-practicas';
      break;
    default:
      throw new Error(`Tipo de actor no válido: ${actorType}`);
  }
  
  const template = loadEmailTemplate(templateName, 'practicas');
  
  // Si no se proporciona logoUrl, usar el logo del backend
  const finalLogoUrl = logoUrl || getLogoUrl();
  
  return renderEmailTemplate(template, variables, finalLogoUrl);
};

/**
 * Genera la versión de texto plano de un correo HTML (versión simplificada)
 * @param {string} actorType - Tipo de actor
 * @param {Object} variables - Variables a reemplazar
 * @returns {string} - Texto plano del correo
 */
export const getEmailTextVersion = (actorType, variables = {}) => {
  let greeting;
  let content;
  
  switch (actorType) {
    case 'student':
      greeting = `Estimado Estudiante: ${variables.studentName || ''}`;
      content = `Para la Universidad del Rosario es muy importante conocer su desempeño en la práctica

Programa: ${variables.programName || ''}

Por lo que agradecemos su colaboración en indicarnos el desempeño en el siguiente link: ${variables.link || ''}

Nuestras más sincero agradecimiento por la retroalimentación de su proceso formativo.`;
      break;
    case 'boss':
      greeting = `Estimado Tutor: ${variables.tutorName || ''}`;
      content = `Para la Universidad del Rosario es muy importante conocer el desempeño de nuestro estudiante en práctica

Nombre estudiante: ${variables.studentName || ''}
Programa: ${variables.programName || ''}

Por lo que agradecemos su colaboración en indicarnos el desempeño en el siguiente link: ${variables.link || ''}

Nuestras más sincero agradecimiento por su colaboración en el proceso formativo de nuestro estudiante.`;
      break;
    case 'monitor':
      greeting = `Estimado Monitor: ${variables.tutorName || ''}`;
      content = `Para la Universidad del Rosario es muy importante conocer el desempeño de nuestro estudiante en práctica

Nombre estudiante: ${variables.studentName || ''}
Programa: ${variables.programName || ''}

Por lo que agradecemos su colaboración en indicarnos el desempeño en el siguiente link: ${variables.link || ''}

Nuestras más sincero agradecimiento por su colaboración en el proceso formativo de nuestro estudiante.`;
      break;
    default:
      throw new Error(`Tipo de actor no válido: ${actorType}`);
  }
  
  return `${greeting}

${content}

Cordial Saludo,

Dirección de Evaluación, Permanencia y Éxito Estudiantil
Universidad del Rosario`;
};
