const baseTemplate = (
  content: string,
  greeting: string = 'Olá, ',
  footerText: string = 'Equipe FlatFersa'
) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Email Template</title>
</head>
<body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f7fafc;">
  <div style="max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
    
    <!-- Header -->
    <header style="
        display: flex; 
        justify-content: center; 
        align-items: center; 
        padding: 20px; 
        background-color: #fff; 
        border-radius: 8px 8px 0 0;
        ">
        <img src="https://flatfersa.com.br/wp-content/uploads/2024/07/icone-no-fundo.png" 
            alt="Logo da Empresa" 
            style="max-width: 200px; height: auto;">
    </header>

    <!-- Content -->
    <div style="padding: 30px 25px;">
      <h2 style="color: #2d3748; margin-top: 0;">${greeting}</h2>
      ${content}
    </div>

    <!-- Footer -->
    <footer style="padding: 20px; background-color: #f7fafc; border-radius: 0 0 8px 8px; text-align: center;">
      <p style="color: #718096; margin: 0; font-size: 14px;">
        ${footerText}<br>
        <a href="https://app.flatfersa.com.br" 
           style="color: #4299e1; text-decoration: none;">Acessar Plataforma</a> | 
        <a href="mailto:contato@flatfersa.com.br" 
           style="color: #4299e1; text-decoration: none;">Suporte</a>
      </p>
    </footer>
    
  </div>
</body>
</html>
`;

export const EmailTemplates = {
  SOLICITACAO_RECEBIDA: (clientName: string) =>
    baseTemplate(
      `<div style="color: #4a5568; line-height: 1.6;">
                <p>Sua solicitação de acesso foi recebida com sucesso!</p>
                
                <div style="background-color: #f8f9fa; padding: 15px; border-radius: 6px; margin: 20px 0;">
                    <p style="margin: 0;">
                        Status atual: 
                        <strong style="color: #2b6cb0;">Em análise documental</strong>
                    </p>
                </div>
        
                <p>Nossa equipe está verificando seus documentos e entraremos em contato em até:</p>
                <ul style="margin: 15px 0; padding-left: 20px;">
                    <li>48 horas úteis para solicitações de acesso</li>
                    <li>5 dias úteis para análise de contratos</li>
                </ul>
            </div>`,
      `Olá, ${clientName}!`,
      "Atenciosamente, Equipe de Cadastro"
    ),
  ACESSO_LIBERADO: (clientName: string, email: string, loginLink: string) =>
    baseTemplate(
      `<div style="color: #4a5568;">
                <p>Seu acesso foi liberado! Utilize os seguintes dados para entrar na plataforma:</p>
                
                <div style="background-color: #ebf4ff; padding: 20px; border-radius: 8px; margin: 25px 0;">
                    <p style="margin: 5px 0;">
                        📧 Login: <strong>${email}</strong>
                    </p>
                    <p style="margin: 5px 0;">
                        🔑 Senha inicial: <strong>Seu CPF</strong>
                    </p>
                </div>

                <a href="${loginLink}" 
                    style="display: inline-block; background-color: #48bb78; color: white; 
                            padding: 12px 30px; border-radius: 6px; text-decoration: none; 
                            margin: 15px 0;">
                    Primeiro Acesso
                </a>

                <p style="color: #718096; font-size: 14px;">
                    Recomendamos alterar sua senha após o primeiro login.
                </p>
            </div>`,
      `Bemvindo, ${clientName}!`,
      "Atenciosamente, Equipe de Suporte"
    ),
  NOVA_SOLICITACAO_ADMIN: (clientName: string) =>
    baseTemplate(
      `<div style="color: #4a5568;">
                <p style="margin-top: 0;">Nova solicitação requer análise:</p>
                
                <div style="border-left: 4px solid #4299e1; padding-left: 15px; margin: 20px 0;">
                  <p style="margin: 5px 0;">
                    👤 Cliente: <strong>${clientName}</strong>
                  </p>
                  <p style="margin: 5px 0;">
                    📅 Data: ${new Date().toLocaleDateString('pt-BR')}
                  </p>
                </div>
        
                <a href="https://app.flatfersa.com.br/clientes" 
                   style="display: inline-block; background-color: #4299e1; color: white; 
                          padding: 10px 25px; border-radius: 6px; text-decoration: none;">
                  Ver Solicitação
                </a>
              </div>`,
      "Nova Solicitação no Sistema!",
      "Notificação Automática - Sistema de Aprovações"
    ),
  ADMIN_NOVO_CONTRATO: (clientName: string) =>
    baseTemplate(
      `<div style="color: #4a5568;">
                <p style="margin-top: 0;">Nova solicitação de contrato requer análise:</p>
                
                <div style="border-left: 4px solid #4299e1; padding-left: 15px; margin: 20px 0;">
                  <p style="margin: 5px 0;">
                    👤 Cliente: <strong>${clientName}</strong>
                  </p>
                  <p style="margin: 5px 0;">
                    📅 Data Solicitação: ${new Date().toLocaleDateString('pt-BR')}
                  </p>
                </div>
        
                <a href="https://app.flatfersa.com.br/contratos" 
                   style="display: inline-block; background-color: #4299e1; color: white; 
                          padding: 10px 25px; border-radius: 6px; text-decoration: none;
                          margin-bottom: 15px;">
                  Analisar Contrato
                </a>
        
                <p style="color: #718096; font-size: 14px;">
                  Prazo máximo para análise: 72 horas úteis
                </p>
              </div>`,
      "Nova Solicitação de Contrato!",
      "Notificação Automática - Sistema de Contratos"
    ),
  CLIENTE_AGUARDANDO_APROVACAO: (clientName: string) =>
    baseTemplate(
      `<div style="color: #4a5568;">
                <p>Olá <strong>${clientName}</strong>,</p>
                
                <p>Recebemos sua solicitação de contrato e ela está em análise.</p>
        
                <div style="background-color: #fffaf0; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <p style="margin: 5px 0; color: #dd6b20;">
                    ⏳ Status Atual: <strong>Em Análise Documental</strong>
                  </p>
                  <p style="margin: 5px 0; color: #718096;">
                    Prazo estimado: 3 dias úteis
                  </p>
                </div>
        
                <p>Você receberá atualizações por email sobre:</p>
                <ul style="margin: 15px 0; padding-left: 20px; color: #718096;">
                  <li>Aprovação do contrato</li>
                  <li>Necessidade de documentos adicionais</li>
                  <li>Próximos passos</li>
                </ul>
              </div>`,
      `Solicitação Recebida, ${clientName}!`,
      "Atenciosamente, Equipe de Contratos"
    ),
  CLIENTE_CONTRATO_APROVADO: (clientName: string) =>
    baseTemplate(
      `<div style="color: #4a5568;">
                <div style="text-align: center; margin: 25px 0;">
                  <div style="display: inline-block; background-color: #48bb78; color: white; 
                       padding: 10px 20px; border-radius: 20px; font-size: 14px;">
                    Contrato Aprovado ✅
                  </div>
                </div>
        
                <p>Prezado(a) <strong>${clientName}</strong>,</p>
                
                <p>Seu contrato foi aprovado e está pronto para assinatura digital:</p>
        
                <div style="text-align: center; margin: 30px 0;">
                  <a href="https://app.flatfersa.com.br/contratos" 
                     style="display: inline-block; background-color: #2d3748; color: white; 
                            padding: 15px 40px; border-radius: 8px; text-decoration: none;
                            font-weight: bold;">
                    Assinar Contrato
                  </a>
                </div>
              </div>`,
      `Parabéns, ${clientName}!`,
      "Atenciosamente, Departamento Jurídico"
    ),
  CLIENTE_VENCIMENTO_PROXIMO: (
    clientName: string,
    dueDate: string,
    amount: number,
    paymentLink: string,
  ) => baseTemplate(
    `<div style="color: #4a5568;">
      <div style="text-align: center; margin: 25px 0;">
        <div style="display: inline-block; background-color: #f6ad55; color: white; 
             padding: 10px 20px; border-radius: 20px; font-size: 14px;">
          Pagamento Próximo do Vencimento ⏳
        </div>
      </div>

      <p>Olá <strong>${clientName}</strong>,</p>
      
      <div style="background-color: #fffaf0; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 5px 0;">
          📅 Vencimento: <strong>${dueDate}</strong><br>
          💰 Valor: <strong>R$ ${amount.toFixed(2)}</strong><br>
        </p>
      </div>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${paymentLink}" 
           style="display: inline-block; background-color: #48bb78; color: white; 
                  padding: 15px 40px; border-radius: 8px; text-decoration: none;
                  font-weight: bold;">
          Realizar Pagamento
        </a>
      </div>

      <p style="color: #718096; font-size: 14px;">
        ⚠️ Após o vencimento, serão cobrados juros de 2% ao dia + taxa fixa de R$ 10,00
      </p>
    </div>`,
    `Pagamento Pendente - ${dueDate}`,
    "Atenciosamente, Departamento Financeiro"
  ),
  ADMIN_LEITURA_ENERGIA: (
    clientName: string,
    aptDetails: string,
    adminLink: string,
    deadline: string
  ) => baseTemplate(
    `<div style="color: #4a5568;">
      <div style="text-align: center; margin: 25px 0;">
        <div style="display: inline-block; background-color: #4299e1; color: white; 
             padding: 10px 20px; border-radius: 20px; font-size: 14px;">
          Leitura de Energia Pendente 🔌
        </div>
      </div>

      <p>Por favor, realize a leitura de energia para:</p>
      
      <div style="border-left: 4px solid #4299e1; padding-left: 15px; margin: 20px 0;">
        <p style="margin: 5px 0;">
          👤 Cliente: <strong>${clientName}</strong><br>
          🏠 Apartamento: ${aptDetails}
        </p>
      </div>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${adminLink}" 
           style="display: inline-block; background-color: #2d3748; color: white; 
                  padding: 15px 40px; border-radius: 8px; text-decoration: none;
                  font-weight: bold;">
            Registrar Leitura
        </a>
      </div>

      <div style="background-color: #ebf4ff; padding: 15px; border-radius: 8px;">
        <p style="margin: 5px 0; color: #2b6cb0;">
          ⚠️ Prazo final para registro: ${deadline}
        </p>
      </div>
    </div>`,
    "Leitura de Energia Pendente!",
    "Notificação Automática - Sistema de Monitoramento"
  ),
  CLIENTE_AGUARDANDO_CONFIRMACAO: (clientName: string, dueDate: string, amount: number) =>
    baseTemplate(
      `<div style="color: #4a5568;">
        <div style="text-align: center; margin: 25px 0;">
          <div style="display: inline-block; background-color: #f6ad55; color: white; 
               padding: 10px 20px; border-radius: 20px; font-size: 14px;">
            Pagamento em Análise 🔍
          </div>
        </div>

        <p>Olá <strong>${clientName}</strong>,</p>
        
        <p>Recebemos seu comprovante de pagamento referente à parcela de <strong>${dueDate}</strong> no valor de <strong>R$ ${amount.toFixed(2)}</strong>.</p>

        <div style="background-color: #fffaf0; padding: 20px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 5px 0; color: #dd6b20;">
            Status atual: <strong>Em análise pela equipe</strong>
          </p>
          <p style="margin: 5px 0; color: #718096;">
            Prazo estimado: 48 horas úteis
          </p>
        </div>

        <p>Você receberá uma confirmação por e-mail assim que concluirmos a análise.</p>
      </div>`,
      `Comprovante Recebido, ${clientName}!`,
      "Atenciosamente, Equipe Financeira"
    ),

  ADMIN_NOVO_COMPROVANTE: (clientName: string, amount: number, adminLink: string) =>
    baseTemplate(
      `<div style="color: #4a5568;">
        <h2 style="color: #2d3748; margin-top: 0;">Novo Comprovante Recebido!</h2>
        
        <div style="border-left: 4px solid #4299e1; padding-left: 15px; margin: 20px 0;">
          <p style="margin: 5px 0;">
            👤 Cliente: <strong>${clientName}</strong><br>
            💰 Valor: R$ ${amount.toFixed(2)}<br>
            📅 Data Envio: ${new Date().toLocaleDateString('pt-BR')}
          </p>
        </div>

        <a href="${adminLink}" 
           style="display: inline-block; background-color: #4299e1; color: white; 
                  padding: 12px 24px; border-radius: 6px; text-decoration: none;">
          Ver Comprovante
        </a>

        <p style="margin-top: 25px; color: #718096;">
          Prazo máximo para análise: 48 horas úteis
        </p>
      </div>`,
      "Novo Comprovante para Análise",
      "Notificação Automática - Sistema de Pagamentos"
    ),

  CLIENTE_PAGAMENTO_CONFIRMADO: (clientName: string, dueDate: string, amount: number) =>
    baseTemplate(
      `<div style="color: #4a5568;">
        <div style="text-align: center; margin: 25px 0;">
          <div style="display: inline-block; background-color: #48bb78; color: white; 
               padding: 10px 20px; border-radius: 20px; font-size: 14px;">
            Pagamento Confirmado ✅
          </div>
        </div>

        <p>Olá <strong>${clientName}</strong>,</p>
        
        <div style="background-color: #f0fff4; padding: 20px; border-radius: 8px;">
          <p style="margin: 5px 0;">
            Parcela: <strong>${dueDate}</strong><br>
            Valor: <strong>R$ ${amount.toFixed(2)}</strong><br>
            Status: <strong style="color: #38a169;">Confirmado</strong>
          </p>
        </div>

        <p style="margin-top: 25px;">Obrigado por manter seus pagamentos em dia! 🎉</p>
      </div>`,
      `Pagamento Confirmado, ${clientName}!`,
      "Atenciosamente, Departamento Financeiro"
    ),

  CLIENTE_PAGAMENTO_REPROVADO: (clientName: string, dueDate: string, reason: string) =>
    baseTemplate(
      `<div style="color: #4a5568;">
        <div style="text-align: center; margin: 25px 0;">
          <div style="display: inline-block; background-color: #f56565; color: white; 
               padding: 10px 20px; border-radius: 20px; font-size: 14px;">
            Pagamento Requer Ajustes ⚠️
          </div>
        </div>

        <p>Olá <strong>${clientName}</strong>,</p>
        
        <div style="background-color: #fff5f5; padding: 20px; border-radius: 8px;">
          <p style="margin: 5px 0; color: #c53030;">
            Parcela: <strong>${dueDate}</strong><br>
            Status: <strong>Reprovado</strong><br>
            Motivo: ${reason}
          </p>
        </div>
      </div>`,
      `Atenção: Pagamento Reprovado - ${dueDate}`,
      "Atenciosamente, Equipe Financeira"
    )
};