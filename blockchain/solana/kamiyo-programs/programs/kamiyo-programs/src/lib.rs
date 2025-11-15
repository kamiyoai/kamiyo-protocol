use anchor_lang::prelude::*;

declare_id!("DtVpU2Ba3FmQ1EnfWuRqpQs2iSWFWtrUDhSrcDounxMo");

#[program]
pub mod kamiyo_programs {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        msg!("Greetings from: {:?}", ctx.program_id);
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize {}
