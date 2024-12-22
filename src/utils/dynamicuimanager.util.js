class DynamicUIManager {
    constructor() {
      // Initialize Gemini Pro
      this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      this.model = this.genAI.getGenerativeModel({ model: "gemini-pro" });
      
      // In-memory storage for UI configurations (simulating vector store)
      this.uiConfigurations = [
        {
          id: 'user_registration',
          type: 'form',
          description: 'User registration form with fields for personal information',
          keywords: ['user', 'registration', 'signup', 'form'],
          config: {
            formConfig: [
              {
                type: 'text',
                label: 'Full Name',
                name: 'fullName',
                validation: '^[a-zA-Z\\s]+$',
                required: true
              },
              {
                type: 'email',
                label: 'Email Address',
                name: 'email',
                validation: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$'
              }
            ]
          }
        },
        {
          id: 'employee_management',
          type: 'table',
          description: 'Employee management table with search and filter capabilities',
          keywords: ['employee', 'management', 'table', 'hr'],
          config: {
            tableConfig: {
              columns: [
                { label: 'Name', field: 'name' },
                { label: 'Department', field: 'department' }
              ],
              searchable: true
            }
          }
        }
      ];
    }
  
    async semanticSearch(query) {
      // Use Gemini Pro for semantic matching
      const results = await this.searchConfigurationsWithGemini(query);
      return results;
    }
  
    async searchConfigurationsWithGemini(query) {
      // Use Gemini Pro to match query with configurations
      const matchedConfigs = [];
  
      for (const config of this.uiConfigurations) {
        // Prepare prompt for semantic matching
        const prompt = `
          Evaluate how relevant this UI configuration is to the query: "${query}"
          Configuration description: ${config.description}
          Keywords: ${config.keywords.join(', ')}
          
          Respond with a relevance score from 0 to 1, where:
          - 1 means extremely relevant
          - 0.7-0.9 means highly relevant
          - 0.4-0.6 means somewhat relevant
          - 0-0.3 means not relevant
          
          Only return the numeric score.
        `;
  
        try {
          const result = await this.model.generateContent(prompt);
          const relevanceScore = parseFloat(result.response.text().trim());
  
          if (relevanceScore >= 0.6) {
            matchedConfigs.push({
              ...config,
              relevanceScore
            });
          }
        } catch (error) {
          console.error('Semantic search error:', error);
        }
      }
  
      // Sort by relevance score
      return matchedConfigs.sort((a, b) => b.relevanceScore - a.relevanceScore);
    }
  
    async generateDynamicUI(query) {
      // Find relevant configurations
      const configurations = await this.semanticSearch(query);
      
      // Generate UI components
      return configurations.map(config => {
        switch(config.type) {
          case 'form':
            return this.generateFormUI(config.config.formConfig);
          case 'table':
            return this.generateTableUI(config.config.tableConfig);
          default:
            return null;
        }
      });
    }
  
    generateFormUI(formConfig) {
      return {
        type: 'vue_component',
        template: `
          <template>
            <div class="dynamic-form">
              <div v-for="field in formConfig" :key="field.name" class="form-field">
                <label>{{ field.label }}</label>
                <input 
                  :type="field.type" 
                  :name="field.name"
                  :placeholder="field.placeholder || ''"
                  :pattern="field.validation"
                />
              </div>
            </div>
          </template>
          <script>
          export default {
            data() {
              return {
                formConfig: ${JSON.stringify(formConfig)}
              }
            }
          }
          </script>
        `
      };
    }
  
    generateTableUI(tableConfig) {
      return {
        type: 'vue_component',
        template: `
          <template>
            <div class="dynamic-table">
              <table>
                <thead>
                  <tr>
                    <th v-for="col in columns" :key="col.field">
                      {{ col.label }}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="item in items" :key="item.id">
                    <td v-for="col in columns" :key="col.field">
                      {{ item[col.field] }}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
          <script>
          export default {
            data() {
              return {
                columns: ${JSON.stringify(tableConfig.columns)},
                items: ${JSON.stringify(tableConfig.items || [])}
              }
            }
          }
          </script>
        `
      };
    }
  
    // Method to add new UI configuration dynamically
    async addUIConfiguration(config) {
      // Use Gemini Pro to validate and enhance the configuration
      const validationPrompt = `
        Validate this UI configuration:
        ${JSON.stringify(config)}
        
        Check for:
        1. Proper structure
        2. Required fields
        3. Meaningful descriptions
        4. Potential improvements
        
        Respond with:
        - "VALID" if the configuration is acceptable
        - Suggestions for improvement if needed
      `;
  
      try {
        const validationResult = await this.model.generateContent(validationPrompt);
        const validationResponse = validationResult.response.text().trim();
  
        if (validationResponse.startsWith('VALID')) {
          // Add keywords if not provided
          if (!config.keywords) {
            const keywordPrompt = `
              Generate 3-5 keywords for this UI configuration description:
              ${config.description}
            `;
            const keywordResult = await this.model.generateContent(keywordPrompt);
            config.keywords = keywordResult.response.text().trim().split(',').map(k => k.trim());
          }
  
          this.uiConfigurations.push(config);
          return { success: true, message: 'Configuration added successfully' };
        } else {
          return { 
            success: false, 
            message: 'Configuration validation failed',
            suggestions: validationResponse 
          };
        }
      } catch (error) {
        console.error('Configuration validation error:', error);
        return { success: false, message: 'Error validating configuration' };
      }
    }
  }
  